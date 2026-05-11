import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import pLimit from 'p-limit';
import {
	EquivalencePair,
	EquivalenceResult,
	EquivalenceVerdict,
	judgeSemanticEquivalence,
} from './semantic-equivalence-service';
import { computeTextHash, computePairKey } from '../synthesis/textHash';
import { logError } from '../utils/errorHandling';

/**
 * Firestore-backed cache for the four-way LLM-as-judge verdict used in the
 * bulk idea-synthesis pipeline. Verdicts are keyed by **content hash**, not
 * run id, so re-running synthesis on the same question is near-free for any
 * pair whose member texts have not changed.
 *
 * - Doc id = sha1(min(textHashA, textHashB) + '|' + max(textHashA, textHashB))
 * - A cache hit requires: doc exists AND modelId matches current AND
 *   promptVer matches current AND textHashA + textHashB both match the
 *   incoming pair's freshly-computed hashes.
 * - On judge error, results are returned with the conservative fallback
 *   verdict from `judgeSemanticEquivalence` but **never written to the
 *   cache** — so a transient LLM failure does not poison future runs.
 *
 * Bumping `JUDGE_PROMPT_VER` (this file) or `JUDGE_MODEL_ID` invalidates the
 * entire cache without requiring a wipe — every entry becomes a miss.
 *
 * See docs/clusters and synthesis/clustering-and-synthesis-paper.md §5.6.
 */

export const VERDICT_CACHE_COLLECTION = 'synthesisVerdicts';

/**
 * Bump when the LLM judge prompt or four-way semantics change. Existing
 * cache rows with a different value are treated as misses.
 */
export const JUDGE_PROMPT_VER = 'v1';

/**
 * Identifier of the model used by `judgeSemanticEquivalence`. Cache rows
 * with a different value are treated as misses. Keep in sync with the
 * Gemini model returned by `getGeminiModel()`.
 */
export const JUDGE_MODEL_ID = 'gemini-2.5-flash';

const FIRESTORE_IN_LIMIT = 30;
const READ_CONCURRENCY = 5;
const WRITE_BATCH_SIZE = 500;

interface CachedVerdictDoc {
	pairKey: string;
	textHashA: string;
	textHashB: string;
	verdict: EquivalenceVerdict;
	reason: string;
	modelId: string;
	promptVer: string;
	createdAt: number;
}

interface PairWithHashes {
	pairId: string;
	textA: string;
	textB: string;
	hashA: string;
	hashB: string;
	docId: string;
}

export interface CachedJudgeOptions {
	modelId?: string;
	promptVer?: string;
}

/**
 * Drop-in replacement for `judgeSemanticEquivalence` that consults the
 * Firestore verdict cache before invoking the LLM. Returns one
 * `EquivalenceResult` per input pair, in input order.
 *
 * Failure mode: any error reading the cache falls through to the
 * uncached judge (fail-open). A judge failure on the LLM side is caught
 * inside `judgeSemanticEquivalence` itself; those results are returned
 * but not persisted, preserving the cache's correctness.
 */
export async function judgeSemanticEquivalenceCached(
	pairs: EquivalencePair[],
	options: CachedJudgeOptions = {},
): Promise<EquivalenceResult[]> {
	if (pairs.length === 0) return [];

	const modelId = options.modelId ?? JUDGE_MODEL_ID;
	const promptVer = options.promptVer ?? JUDGE_PROMPT_VER;

	const enriched: PairWithHashes[] = pairs.map((p) => {
		const hashA = computeTextHash(p.textA);
		const hashB = computeTextHash(p.textB);

		return {
			pairId: p.pairId,
			textA: p.textA,
			textB: p.textB,
			hashA,
			hashB,
			docId: computePairKey(hashA, hashB),
		};
	});

	const cached = await readCachedVerdicts(
		enriched.map((e) => e.docId),
		modelId,
		promptVer,
	);

	const hits: EquivalenceResult[] = [];
	const missPairs: EquivalencePair[] = [];
	const missByPairId = new Map<string, PairWithHashes>();

	for (const e of enriched) {
		const cachedDoc = cached.get(e.docId);
		if (cachedDoc && verdictMatchesPair(cachedDoc, e)) {
			hits.push({
				pairId: e.pairId,
				verdict: cachedDoc.verdict,
				reason: cachedDoc.reason,
			});
		} else {
			missPairs.push({ pairId: e.pairId, textA: e.textA, textB: e.textB });
			missByPairId.set(e.pairId, e);
		}
	}

	let missResults: EquivalenceResult[] = [];
	if (missPairs.length > 0) {
		missResults = await judgeSemanticEquivalence(missPairs);
		await persistVerdicts(missResults, missByPairId, modelId, promptVer).catch((error) => {
			logError(error, {
				operation: 'verdictCache.persistVerdicts',
				metadata: { resultCount: missResults.length },
			});
			// Persistence failure is non-fatal: results still flow back to caller.
		});
	}

	const byPairId = new Map<string, EquivalenceResult>();
	for (const r of hits) byPairId.set(r.pairId, r);
	for (const r of missResults) byPairId.set(r.pairId, r);

	const ordered: EquivalenceResult[] = [];
	for (const p of pairs) {
		const r = byPairId.get(p.pairId);
		if (r) {
			ordered.push(r);
		} else {
			ordered.push({
				pairId: p.pairId,
				verdict: 'different',
				reason: 'No verdict produced',
			});
		}
	}

	return ordered;
}

async function readCachedVerdicts(
	docIds: string[],
	modelId: string,
	promptVer: string,
): Promise<Map<string, CachedVerdictDoc>> {
	const result = new Map<string, CachedVerdictDoc>();
	if (docIds.length === 0) return result;

	const db = getFirestore();
	const collection = db.collection(VERDICT_CACHE_COLLECTION);

	const chunks: string[][] = [];
	for (let i = 0; i < docIds.length; i += FIRESTORE_IN_LIMIT) {
		chunks.push(docIds.slice(i, i + FIRESTORE_IN_LIMIT));
	}

	const limit = pLimit(READ_CONCURRENCY);
	try {
		await Promise.all(
			chunks.map((chunk) =>
				limit(async () => {
					const snapshot = await collection.where(FieldPath.documentId(), 'in', chunk).get();
					snapshot.docs.forEach((doc) => {
						const data = doc.data() as CachedVerdictDoc | undefined;
						if (!data) return;
						if (data.modelId !== modelId) return;
						if (data.promptVer !== promptVer) return;
						result.set(doc.id, data);
					});
				}),
			),
		);
	} catch (error) {
		logError(error, {
			operation: 'verdictCache.readCachedVerdicts',
			metadata: { docCount: docIds.length },
		});
		// Fall through with whatever we managed to read; misses are safe.
	}

	return result;
}

function verdictMatchesPair(doc: CachedVerdictDoc, pair: PairWithHashes): boolean {
	const docHashes = [doc.textHashA, doc.textHashB].sort();
	const pairHashes = [pair.hashA, pair.hashB].sort();

	return docHashes[0] === pairHashes[0] && docHashes[1] === pairHashes[1];
}

async function persistVerdicts(
	results: EquivalenceResult[],
	missByPairId: Map<string, PairWithHashes>,
	modelId: string,
	promptVer: string,
): Promise<void> {
	if (results.length === 0) return;

	const db = getFirestore();
	const collection = db.collection(VERDICT_CACHE_COLLECTION);
	const now = Date.now();

	const writableResults = results.filter((r) => !isFallbackResult(r));
	if (writableResults.length === 0) return;

	for (let i = 0; i < writableResults.length; i += WRITE_BATCH_SIZE) {
		const batch = db.batch();
		const slice = writableResults.slice(i, i + WRITE_BATCH_SIZE);

		for (const result of slice) {
			const meta = missByPairId.get(result.pairId);
			if (!meta) continue;
			const doc: CachedVerdictDoc = {
				pairKey: meta.docId,
				textHashA: meta.hashA,
				textHashB: meta.hashB,
				verdict: result.verdict,
				reason: result.reason,
				modelId,
				promptVer,
				createdAt: now,
			};
			batch.set(collection.doc(meta.docId), doc);
		}

		await batch.commit();
	}
}

/**
 * Verdicts produced by the conservative fallback path inside
 * `judgeSemanticEquivalence` (LLM call failed, parse failed, or pair
 * omitted from the model response) must never be persisted — they would
 * poison the cache with a permanent "different" for a pair the LLM might
 * judge correctly on retry.
 */
function isFallbackResult(result: EquivalenceResult): boolean {
	if (result.verdict !== 'different') return false;
	const reason = result.reason || '';

	return (
		reason === 'LLM call failed; defaulting to different' ||
		reason === 'No verdict returned by model'
	);
}
