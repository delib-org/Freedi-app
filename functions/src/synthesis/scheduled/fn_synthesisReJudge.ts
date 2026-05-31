import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, functionConfig, type Statement } from '@freedi/shared-types';
import { embeddingCache } from '../../services/embedding-cache-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';

/**
 * Merge gate for reJudge.
 *
 * Set BELOW DEFAULT_SYNTHESIS_SETTINGS.attachThreshold (0.85) because the
 * live pipeline's attach gate is per-pair (one cosine value), while reJudge
 * uses top-2 cross-member-pair average (two pairs must agree). The two-pair
 * confirmation provides natural robustness, so we can be more permissive on
 * the single-number cutoff without admitting outlier-driven merges.
 *
 * Calibrated against the synth benchmark: friends-time and
 * community-clubs paraphrases in run #6 split into 5+4 synths with
 * cross-member top-2 average in the 0.80-0.84 range. 0.82 captures those
 * true duplicates while leaving cross-topic pairs (typical top-2-avg ≤0.75)
 * untouched.
 */
const REJUDGE_MERGE_THRESHOLD = 0.82;

/**
 * Cross-synth reJudge sweep — merges duplicate synths the live pipeline
 * created in separate moments under spawn-debounce conditions.
 *
 * Scenario this targets (observed on the synth benchmark at run #5):
 *   - Live pipeline spawns synth A at cosine 0.88 from paraphrase pair {a1, a2}.
 *   - 12 s later paraphrase a3 arrives. Synth A's title-embedding cosine to a3
 *     is ~0.78 (Stage B member-promotion brings it to ~0.86 — fine, attaches).
 *   - But under bulk spawn timing, paraphrase a7 finds a8 first and spawns
 *     synth B from {a7, a8} during synth A's spawn-debounce window.
 *   - Result: 2 synths that should be one. Stage B can't merge them because
 *     it only attaches plain options into clusters — it doesn't merge cluster
 *     statements into each other.
 *
 * This sweep finds those: for each parent with ≥2 synths, computes pairwise
 * cross-synth best-member cosines, and when the best-pair cosine ≥
 * attachThreshold (i.e. two members from different synths are near-duplicates),
 * merges donor into recipient. Recipient is the synth with more members;
 * ties broken by earlier `createdAt`.
 *
 * Conservative: no LLM call in the merge decision. A cosine of 0.85+ between
 * two members from different synths means those two members would attach to
 * each other if they were both plain options; that's the strongest possible
 * signal that the containing synths overlap. The recipient's title regenerates
 * after the merge via enqueueClusterRecompute.
 *
 * Bounded: at most MAX_PARENTS_PER_SWEEP per tick; at most MAX_MERGES_PER_PARENT
 * to avoid a runaway chain of merges that should be its own design decision.
 *
 * Cost per parent with M synths averaging K members: 1 batch read of M*K
 * member embeddings + O(M²·K²) in-memory cosine comparisons. At realistic
 * parent sizes (M ≤ 50, K ≤ 100) that's ≤25M comparisons per parent — fast.
 */

const MAX_PARENTS_PER_SWEEP = 30;
const MAX_MERGES_PER_PARENT = 10;
const SYNTH_QUERY_LIMIT = 2_000;

interface CandidateSynth {
	doc: Statement;
	members: string[];
}

function db() {
	return getFirestore();
}

function cosine(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface MergeDecision {
	recipientIdx: number;
	donorIdx: number;
	bestCosine: number;
}

function pickMergePair(
	synths: CandidateSynth[],
	embeddings: Map<string, number[]>,
	threshold: number,
): MergeDecision | null {
	let best: MergeDecision | null = null;
	for (let i = 0; i < synths.length; i++) {
		for (let j = i + 1; j < synths.length; j++) {
			const a = synths[i];
			const b = synths[j];
			// Compute every cross-member cosine, then take top-2 average.
			// A single high-cosine outlier pair is not enough — vocabulary
			// overlap between distinct ideas can produce one lucky 0.86 pair.
			// Requiring two pairs above threshold is strong evidence that
			// the synths overlap rather than coincidentally vocab-share.
			const crossCosines: number[] = [];
			for (const aMember of a.members) {
				const aEmb = embeddings.get(aMember);
				if (!aEmb) continue;
				for (const bMember of b.members) {
					const bEmb = embeddings.get(bMember);
					if (!bEmb) continue;
					crossCosines.push(cosine(aEmb, bEmb));
				}
			}
			if (crossCosines.length < 2) continue;
			crossCosines.sort((x, y) => y - x);
			const top2Avg = (crossCosines[0] + crossCosines[1]) / 2;
			const pairMax = top2Avg;
			if (pairMax >= threshold) {
				// Pick the larger synth as recipient; tie-break by earlier createdAt.
				const recipientIdx =
					a.members.length > b.members.length
						? i
						: a.members.length < b.members.length
							? j
							: (a.doc.createdAt ?? 0) <= (b.doc.createdAt ?? 0)
								? i
								: j;
				const donorIdx = recipientIdx === i ? j : i;
				if (!best || pairMax > best.bestCosine) {
					best = { recipientIdx, donorIdx, bestCosine: pairMax };
				}
			}
		}
	}

	return best;
}

async function mergeSynths(
	recipient: CandidateSynth,
	donor: CandidateSynth,
	bestCosine: number,
): Promise<void> {
	const recipientRef = db().collection(Collections.statements).doc(recipient.doc.statementId);
	const donorRef = db().collection(Collections.statements).doc(donor.doc.statementId);

	const mergedMembers = Array.from(new Set([...recipient.members, ...donor.members]));
	const now = Date.now();

	await recipientRef.update({
		integratedOptions: mergedMembers,
		lastUpdate: now,
	});
	await donorRef.update({
		hide: true,
		mergedInto: recipient.doc.statementId,
		lastUpdate: now,
	});

	await recordLiveSynthEvent({
		action: 'merge',
		clusterId: recipient.doc.statementId,
		reason: `reJudge merge at cross-member cosine=${bestCosine.toFixed(3)}`,
		prevState: {
			recipientMembers: recipient.members,
			donorClusterId: donor.doc.statementId,
			donorMembers: donor.members,
		},
		newState: {
			integratedOptions: mergedMembers,
			donorHidden: true,
		},
		triggerSource: 'reJudgeSweep',
		parentStatementId: recipient.doc.parentId,
	});

	// Update local cache so the next iteration sees the merged state.
	recipient.members = mergedMembers;
	// Regenerate recipient title now that its membership grew.
	try {
		await enqueueClusterRecompute(
			recipient.doc.statementId,
			'reJudgeSweep:merge',
			recipient.doc.creatorId,
		);
	} catch (error) {
		logger.warn('synthesis.reJudge: enqueueClusterRecompute failed (non-fatal)', {
			recipientId: recipient.doc.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function processParent(parentId: string, synthDocs: Statement[]): Promise<{
	merges: number;
}> {
	if (synthDocs.length < 2) return { merges: 0 };

	const synths: CandidateSynth[] = synthDocs.map((d) => ({
		doc: d,
		members: Array.isArray(d.integratedOptions) ? [...d.integratedOptions] : [],
	}));

	// Batch-fetch every member's embedding across all synths in this parent.
	const allMemberIds = new Set<string>();
	for (const s of synths) for (const m of s.members) allMemberIds.add(m);
	if (allMemberIds.size === 0) return { merges: 0 };

	let embeddings: Map<string, number[]> | undefined;
	try {
		embeddings = await embeddingCache.getBatchEmbeddings(Array.from(allMemberIds));
	} catch (error) {
		logger.warn('synthesis.reJudge: embedding batch fetch failed', {
			parentId,
			memberCount: allMemberIds.size,
			error: error instanceof Error ? error.message : String(error),
		});

		return { merges: 0 };
	}
	if (!embeddings || typeof embeddings.get !== 'function') return { merges: 0 };

	const threshold = REJUDGE_MERGE_THRESHOLD;
	let merges = 0;
	// Loop: find best merge pair, perform it, repeat. Each merge shrinks the
	// synth list; recompute pairs each iteration so freshly-merged recipients
	// can attract further donors.
	while (merges < MAX_MERGES_PER_PARENT && synths.length >= 2) {
		const decision = pickMergePair(synths, embeddings, threshold);
		if (!decision) break;
		const recipient = synths[decision.recipientIdx];
		const donor = synths[decision.donorIdx];
		await mergeSynths(recipient, donor, decision.bestCosine);
		synths.splice(decision.donorIdx, 1);
		merges++;
	}

	return { merges };
}

export const fn_synthesisReJudge = onSchedule(
	{
		schedule: 'every 10 minutes',
		timeZone: 'UTC',
		...functionConfig,
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async () => {
		const startedAt = Date.now();
		try {
			// Fetch up to SYNTH_QUERY_LIMIT non-hidden synth docs and group by
			// parentId. Collection-group scope on parentId avoids needing a
			// composite index dedicated to this sweep.
			const snap = await db()
				.collection(Collections.statements)
				.where('derivedByPipeline', '==', 'synthesis')
				.where('hide', '==', false)
				.limit(SYNTH_QUERY_LIMIT)
				.get();
			if (snap.empty) return;

			const byParent = new Map<string, Statement[]>();
			for (const doc of snap.docs) {
				const s = doc.data() as Statement;
				const list = byParent.get(s.parentId) ?? [];
				list.push(s);
				byParent.set(s.parentId, list);
			}

			let totalMerges = 0;
			let parentsProcessed = 0;
			for (const [parentId, synths] of byParent) {
				if (parentsProcessed >= MAX_PARENTS_PER_SWEEP) break;
				if (synths.length < 2) continue;
				parentsProcessed++;
				try {
					const result = await processParent(parentId, synths);
					totalMerges += result.merges;
					if (result.merges > 0) {
						logger.info('synthesis.reJudge.parent', {
							parentId,
							inputSynths: synths.length,
							merges: result.merges,
						});
					}
				} catch (error) {
					logger.warn('synthesis.reJudge: parent processing failed', {
						parentId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			logger.info('synthesis.reJudge.summary', {
				parentsProcessed,
				totalMerges,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			logger.error('synthesis.reJudge: sweep failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
);
