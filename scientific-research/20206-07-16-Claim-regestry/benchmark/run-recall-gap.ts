/**
 * Condition E — the recall-gap benchmark: the mirror image of the hard triplets.
 *
 * Procaccia's triplets trap the RULER (similar words, opposite meaning). This
 * condition traps the GATE (different words, same meaning): for each pilot
 * anchor, generate rewrites that preserve the exact stance while sharing as few
 * words as possible, SELECT the one the embedding model scores LOWEST against
 * the anchor, verify meaning preservation with an independent stronger model,
 * then ask the production judge to classify it against the anchor's claim.
 *
 *   B1-E recall  = judge attaches (always sees the claim)
 *   A2-E recall  = judge attaches AND cosine ≥ gate (gated retrieval would
 *                  have shown it the claim at all)
 *
 * The per-cosine-band difference IS the recall gap that the main benchmark
 * could not measure (all its pairs were high-cosine by construction).
 *
 * Two selected variants per anchor: the most adversarial ENGLISH rewrite, and
 * a HEBREW paraphrase (cross-language = naturally low cosine + a real Freedi
 * scenario). Verification (gpt-4o) walks candidates from lowest cosine up and
 * keeps the first that preserves meaning — so selection can't smuggle in
 * meaning drift to win low cosine.
 *
 * Usage: LLM_CONCURRENCY=4 npx tsx run-recall-gap.ts [--sample results/pilot-ids.json] [--limit N]
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env';

loadEnv();

import {
	classifyAgainstClaims,
	type ClaimClassification,
	type ClusterClaim,
} from '../../../functions/src/services/claim-registry-service';
import { callLLM, extractJson, getOpenAI, TAXONOMY_MODEL, WORKER_MODEL } from '../../../functions/src/config/openai-chat';
import { loadTriplets, questionFor, type Triplet } from './lib/datasets';
import { appendJsonl, doneIds, resultsPath } from './lib/io';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const RESULT_FILE = 'recall-gap-E.jsonl';

const REWRITE_STYLES = ['colloquial', 'formal', 'metaphorical', 'values'] as const;

const GENERATE_SYSTEM = `You rewrite opinion statements from public deliberations. Produce rewrites that preserve the EXACT position — same stance, same subject, same direction and magnitude — while sharing as few words as possible with the original.

Rules:
- The author of the original must fully agree that each rewrite states their position.
- Do NOT reuse the original's content words (nouns, verbs, adjectives) in the English rewrites; use synonyms, paraphrase, different sentence structure and register.
- Do NOT weaken, strengthen, generalize, or add hedges. No stance drift.
- Keep each rewrite roughly one sentence, self-contained.

Produce exactly these five rewrites:
- "colloquial": casual spoken register
- "formal": bureaucratic/report register
- "metaphorical": uses an image or idiom to carry the same position
- "values": expresses the same position as a value/principle statement
- "hebrew": a natural Hebrew paraphrase of the position (not a literal word-by-word translation)

Respond with JSON only:
{"colloquial": "...", "formal": "...", "metaphorical": "...", "values": "...", "hebrew": "..."}`;

const VERIFY_SYSTEM = `You check whether a rewrite of a deliberation statement preserves the author's exact position. The rewrite may be in a different language or register.

Answer "same": true only if the original's author would agree the rewrite states their position — same stance, same subject, same direction, no meaningful weakening/strengthening/generalization. When in doubt, answer false.

Respond with JSON only: {"same": true|false, "reason": "<brief>"}`;

interface CandidateResult {
	style: string;
	text: string;
	cosCtx: number;
}

interface SelectedVariant {
	style: string;
	text: string;
	cosCtx: number;
	verified: boolean;
	verifyReason: string;
	/** How many candidates failed verification before this one (or all, if none passed). */
	rejectedBefore: number;
	classification: ClaimClassification | null;
}

export interface RecallGapRow {
	id: string;
	dataset: string;
	anchor: string;
	candidates: CandidateResult[];
	english: SelectedVariant | null;
	hebrew: SelectedVariant | null;
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function makeClaim(clusterId: string, canonicalClaim: string): ClusterClaim {
	return {
		clusterId,
		canonicalClaim,
		publicExplanation: '',
		claimVersion: 1,
		claimStatus: 'confirmed',
		claimUpdatedAt: 0,
		isSynth: false,
		memberCount: 1,
	};
}

async function generateRewrites(t: Triplet): Promise<Record<string, string> | null> {
	try {
		const text = await callLLM({
			model: WORKER_MODEL,
			system: GENERATE_SYSTEM,
			user: `Question: "${questionFor(t.dataset)}"\n\nOriginal statement: "${t.anchor}"\n\nRespond with the JSON object.`,
			temperature: 0.4,
			maxTokens: 600,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as Record<string, unknown>;
		const out: Record<string, string> = {};
		for (const key of [...REWRITE_STYLES, 'hebrew']) {
			if (typeof parsed[key] === 'string' && (parsed[key] as string).trim()) {
				out[key] = (parsed[key] as string).trim();
			}
		}

		return Object.keys(out).length >= 3 ? out : null;
	} catch {
		return null;
	}
}

async function verifySame(t: Triplet, rewrite: string): Promise<{ same: boolean; reason: string }> {
	try {
		const text = await callLLM({
			model: TAXONOMY_MODEL,
			system: VERIFY_SYSTEM,
			user: `Question: "${questionFor(t.dataset)}"\n\nOriginal: "${t.anchor}"\n\nRewrite: "${rewrite}"\n\nRespond with the JSON object.`,
			temperature: 0,
			maxTokens: 200,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as { same?: unknown; reason?: unknown };

		return {
			same: parsed.same === true,
			reason: typeof parsed.reason === 'string' ? parsed.reason : '',
		};
	} catch {
		return { same: false, reason: 'verification call failed' };
	}
}

/** Walk candidates from lowest cosine up; keep the first that verifies. */
async function selectAndJudge(
	t: Triplet,
	pool: CandidateResult[],
): Promise<SelectedVariant | null> {
	const ordered = [...pool].sort((a, b) => a.cosCtx - b.cosCtx);
	let rejected = 0;
	for (const candidate of ordered) {
		const verdict = await verifySame(t, candidate.text);
		if (!verdict.same) {
			rejected++;
			continue;
		}
		const classification = await classifyAgainstClaims({
			statementText: candidate.text,
			questionText: questionFor(t.dataset),
			claims: [makeClaim(t.id, t.anchor)],
			model: WORKER_MODEL,
		});
		if (classification.failedClosed) throw new Error(`classification failed closed for ${t.id}`);

		return { ...candidate, verified: true, verifyReason: verdict.reason, rejectedBefore: rejected, classification };
	}
	// none verified — record the most adversarial candidate as unusable
	const worst = ordered[0];

	return worst
		? { ...worst, verified: false, verifyReason: 'no candidate preserved meaning', rejectedBefore: rejected, classification: null }
		: null;
}

function parseArgs(): { sample?: string; limit?: number } {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return { sample: get('--sample'), limit: get('--limit') ? Number(get('--limit')) : undefined };
}

async function main(): Promise<void> {
	const { sample, limit } = parseArgs();
	let triplets = loadTriplets('main');
	if (sample) {
		const ids = new Set(JSON.parse(readFileSync(sample, 'utf8')) as string[]);
		triplets = triplets.filter((t) => ids.has(t.id));
	}
	if (limit) triplets = triplets.slice(0, limit);

	const done = doneIds(RESULT_FILE);
	const todo = triplets.filter((t) => !done.has(t.id));
	console.info(`Recall-gap E: ${todo.length} anchors to process (${done.size} already done)`);

	const openai = getOpenAI();
	let completed = 0;

	await Promise.all(
		todo.map(async (t) => {
			const rewrites = await generateRewrites(t);
			if (!rewrites) {
				console.error(`generation failed for ${t.id}, skipping`);

				return;
			}

			// Embed anchor + all candidates in the production ctx format.
			const q = questionFor(t.dataset);
			const ctx = (text: string): string => `Question: ${q}\nAnswer: ${text}`;
			const entries = Object.entries(rewrites);
			const response = await openai.embeddings.create({
				model: EMBEDDING_MODEL,
				input: [ctx(t.anchor), ...entries.map(([, text]) => ctx(text))],
			});
			const vectors = response.data.map((d) => d.embedding);
			const anchorVector = vectors[0];
			const candidates: CandidateResult[] = entries.map(([style, text], i) => ({
				style,
				text,
				cosCtx: cosine(anchorVector, vectors[i + 1]),
			}));

			const english = await selectAndJudge(t, candidates.filter((c) => c.style !== 'hebrew'));
			const hebrewPool = candidates.filter((c) => c.style === 'hebrew');
			const hebrew = hebrewPool.length > 0 ? await selectAndJudge(t, hebrewPool) : null;

			appendJsonl(RESULT_FILE, {
				id: t.id,
				dataset: t.dataset,
				anchor: t.anchor,
				candidates,
				english,
				hebrew,
			} satisfies RecallGapRow);
			completed++;
			if (completed % 15 === 0) console.info(`  processed ${completed}/${todo.length}`);
		}),
	);
	console.info(`Done → ${resultsPath(RESULT_FILE)}`);
}

main().catch((error) => {
	console.error('run-recall-gap failed:', error);
	process.exit(1);
});
