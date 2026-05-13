import { logger } from 'firebase-functions';
import {
	judgeSemanticEquivalenceCached,
	type CachedJudgeOptions,
} from '../services/verdict-cache-service';
import {
	type EquivalencePair,
	type EquivalenceResult,
} from '../services/semantic-equivalence-service';
import { cosineSimilarity } from './bulkCluster';
import { pairKey, refineComponent } from './completeLinkage';

/**
 * Two-tier verification of cluster candidates.
 *
 * Replaces all-pairs LLM judging — which scales as O(N²) inside a cluster —
 * with a centroid-anchored, cosine-banded approach:
 *
 *   For each cluster:
 *     1. Pick the *medoid* (member with the highest mean cosine to the
 *        rest). The medoid is the most "central" wording inside the cluster.
 *     2. For each non-medoid member m, compute cosine(m, medoid).
 *     3. Apply the verification band:
 *          cosine ≥ AUTO_ACCEPT_BAND (0.94)  →  treat as equivalent without LLM
 *          cosine <  AUTO_REJECT_BAND (0.82) →  treat as dissent without LLM
 *          cosine in gray band               →  call LLM judge member↔medoid
 *     4. Tally:
 *          ≥80% agree  →  keep the entire cluster as-is
 *          50–80%      →  keep the agreed subset; send dissenters through
 *                          existing `refineComponent` to recover any sub-clique
 *          <50%        →  drop the cluster (cosine alone wasn't enough signal)
 *
 * Plus a hard run-level cap on LLM calls. When exceeded, remaining clusters
 * skip LLM and are accepted on cosine signal alone with `verifiedBy:
 * 'cosine-only'` set on the result. The admin UI can surface those for
 * manual review before they're committed downstream.
 *
 * This module is the bulk-pipeline replacement for the historical Phase 4
 * all-pairs `judgeSemanticEquivalenceCached` call. Reuses the same cache
 * via `judgeSemanticEquivalenceCached`, so verdicts already paid for are
 * still hit.
 */

export interface ClusterCandidate {
	/** Stable identifier for this cluster (e.g. derived from member ids). */
	clusterId: string;
	/** Member statement ids. Must include at least 2 entries to be meaningful. */
	memberIds: string[];
}

export interface ClusterMember {
	id: string;
	text: string;
	embedding: number[];
}

export interface VerifiedCluster {
	clusterId: string;
	memberIds: string[];
	medoidId: string;
	verifiedBy: 'cosine+llm' | 'cosine-only';
	/** Members that were agreed to be equivalent to the medoid. */
	agreedMemberIds: string[];
	/** Members that the medoid-judge rejected (kept for telemetry, not in output). */
	dissentMemberIds: string[];
}

export interface TwoTierJudgeOptions {
	/**
	 * Auto-accept upper band: cosine to medoid at or above this is treated
	 * as equivalent without LLM. Default 0.94 — matches the plan.
	 */
	autoAcceptBand?: number;
	/**
	 * Auto-reject lower band: cosine to medoid below this is treated as
	 * dissent without LLM. Default 0.82.
	 */
	autoRejectBand?: number;
	/**
	 * Fraction of members that must agree with the medoid to keep the
	 * whole cluster. Default 0.80.
	 */
	keepThreshold?: number;
	/**
	 * Below this fraction, the cluster is discarded entirely. Between
	 * `splitFloor` and `keepThreshold` the cluster is kept-with-split
	 * (dissenters routed through `refineComponent`). Default 0.50.
	 */
	splitFloor?: number;
	/**
	 * Hard cap on LLM judge calls for this run. Default
	 * `min(2000, workingSetSize × 0.2)` — caller should pass the working-
	 * set size if they want the size-scaled cap, otherwise plain 2000.
	 */
	maxLlmCalls?: number;
	/** Forwarded to the cached judge. */
	judgeOptions?: CachedJudgeOptions;
}

export interface TwoTierJudgeResult {
	verifiedClusters: VerifiedCluster[];
	droppedClusters: Array<{ clusterId: string; reason: string }>;
	/**
	 * Clusters that were sent to `refineComponent` for the dissent subset
	 * and yielded extra cliques. Each refined clique becomes its own
	 * VerifiedCluster (verifiedBy='cosine+llm'). Captured separately from
	 * `verifiedClusters` for telemetry; callers should concat both.
	 */
	refinedFromDissent: VerifiedCluster[];
	stats: {
		inputClusterCount: number;
		llmCallsMade: number;
		llmCallsCapped: boolean;
		autoAcceptCount: number;
		autoRejectCount: number;
		grayBandCount: number;
		durationMs: number;
	};
}

const DEFAULT_AUTO_ACCEPT_BAND = 0.94;
const DEFAULT_AUTO_REJECT_BAND = 0.82;
const DEFAULT_KEEP_THRESHOLD = 0.8;
const DEFAULT_SPLIT_FLOOR = 0.5;
const DEFAULT_MAX_LLM_CALLS = 2000;

/**
 * Pick the medoid: the member whose mean cosine similarity to all other
 * cluster members is highest. Linear in members, no LLM.
 */
export function pickMedoid(memberIds: string[], embeddings: Map<string, number[]>): string {
	if (memberIds.length === 0) return '';
	if (memberIds.length === 1) return memberIds[0];

	let bestId = memberIds[0];
	let bestMean = -Infinity;
	for (const candidateId of memberIds) {
		const candidateVec = embeddings.get(candidateId);
		if (!candidateVec) continue;
		let sum = 0;
		let count = 0;
		for (const otherId of memberIds) {
			if (otherId === candidateId) continue;
			const otherVec = embeddings.get(otherId);
			if (!otherVec) continue;
			sum += cosineSimilarity(candidateVec, otherVec);
			count += 1;
		}
		const mean = count > 0 ? sum / count : 0;
		if (mean > bestMean) {
			bestMean = mean;
			bestId = candidateId;
		}
	}

	return bestId;
}

/**
 * Verify candidate clusters with the two-tier strategy. See module doc.
 */
export async function twoTierJudge(
	candidates: ClusterCandidate[],
	members: Map<string, ClusterMember>,
	options: TwoTierJudgeOptions = {},
): Promise<TwoTierJudgeResult> {
	const startTime = Date.now();
	const autoAccept = options.autoAcceptBand ?? DEFAULT_AUTO_ACCEPT_BAND;
	const autoReject = options.autoRejectBand ?? DEFAULT_AUTO_REJECT_BAND;
	const keepThreshold = options.keepThreshold ?? DEFAULT_KEEP_THRESHOLD;
	const splitFloor = options.splitFloor ?? DEFAULT_SPLIT_FLOOR;
	const maxLlmCalls = options.maxLlmCalls ?? DEFAULT_MAX_LLM_CALLS;

	const embeddings = new Map<string, number[]>();
	const texts = new Map<string, string>();
	members.forEach((m, id) => {
		embeddings.set(id, m.embedding);
		texts.set(id, m.text);
	});

	// Pass 1: classify each member of each cluster as auto-accept / auto-reject /
	// gray, and queue gray-band pairs for the LLM in a single batch.
	interface PerCluster {
		clusterId: string;
		memberIds: string[];
		medoidId: string;
		autoAccepted: string[];
		autoRejected: string[];
		grayPending: Array<{ memberId: string; pair: EquivalencePair }>;
	}

	const perCluster: PerCluster[] = [];
	let autoAcceptCount = 0;
	let autoRejectCount = 0;
	let grayBandCount = 0;

	for (const candidate of candidates) {
		if (candidate.memberIds.length < 2) {
			// Singleton clusters can't be verified or split — drop with reason.
			perCluster.push({
				clusterId: candidate.clusterId,
				memberIds: candidate.memberIds,
				medoidId: candidate.memberIds[0] ?? '',
				autoAccepted: [],
				autoRejected: [],
				grayPending: [],
			});
			continue;
		}

		const medoidId = pickMedoid(candidate.memberIds, embeddings);
		const medoidVec = embeddings.get(medoidId);
		if (!medoidVec) {
			perCluster.push({
				clusterId: candidate.clusterId,
				memberIds: candidate.memberIds,
				medoidId,
				autoAccepted: [],
				autoRejected: candidate.memberIds.filter((id) => id !== medoidId),
				grayPending: [],
			});
			continue;
		}

		const autoAccepted: string[] = [];
		const autoRejected: string[] = [];
		const grayPending: PerCluster['grayPending'] = [];

		for (const memberId of candidate.memberIds) {
			if (memberId === medoidId) continue;
			const memberVec = embeddings.get(memberId);
			if (!memberVec) {
				autoRejected.push(memberId);
				continue;
			}
			const sim = cosineSimilarity(memberVec, medoidVec);
			if (sim >= autoAccept) {
				autoAccepted.push(memberId);
				autoAcceptCount += 1;
			} else if (sim < autoReject) {
				autoRejected.push(memberId);
				autoRejectCount += 1;
			} else {
				const textA = texts.get(medoidId);
				const textB = texts.get(memberId);
				if (!textA || !textB) {
					autoRejected.push(memberId);
					continue;
				}
				grayPending.push({
					memberId,
					pair: {
						pairId: pairKey(medoidId, memberId),
						textA,
						textB,
					},
				});
				grayBandCount += 1;
			}
		}

		perCluster.push({
			clusterId: candidate.clusterId,
			memberIds: candidate.memberIds,
			medoidId,
			autoAccepted,
			autoRejected,
			grayPending,
		});
	}

	// Pass 2: run LLM judge on gray-band pairs, respecting the run-level cap.
	// Pairs after the cap fall back to cosine-only verification (their cluster
	// is marked verifiedBy='cosine-only' below).
	let llmCallsMade = 0;
	let llmCallsCapped = false;
	const verdictMap = new Map<string, 'agree' | 'dissent' | 'cosine-only'>();

	const allGrayPairs: EquivalencePair[] = [];
	const grayMemberLookup = new Map<string, string>(); // pairId → clusterId
	for (const pc of perCluster) {
		for (const g of pc.grayPending) {
			if (allGrayPairs.length < maxLlmCalls) {
				allGrayPairs.push(g.pair);
				grayMemberLookup.set(g.pair.pairId, pc.clusterId);
			} else {
				// Mark the rest as cosine-only — the cluster's verifiedBy will
				// reflect that the LLM couldn't reach all gray-band members.
				verdictMap.set(g.pair.pairId, 'cosine-only');
				llmCallsCapped = true;
			}
		}
	}

	if (allGrayPairs.length > 0) {
		const verdicts: EquivalenceResult[] = await judgeSemanticEquivalenceCached(
			allGrayPairs,
			options.judgeOptions,
		);
		llmCallsMade = verdicts.length;
		for (const v of verdicts) {
			verdictMap.set(v.pairId, v.verdict === 'same' ? 'agree' : 'dissent');
		}
	}

	// Pass 3: assemble verified clusters per the keep/split/drop tally.
	const verifiedClusters: VerifiedCluster[] = [];
	const droppedClusters: TwoTierJudgeResult['droppedClusters'] = [];
	const refinedFromDissent: VerifiedCluster[] = [];

	for (const pc of perCluster) {
		if (pc.memberIds.length < 2) {
			droppedClusters.push({ clusterId: pc.clusterId, reason: 'singleton' });
			continue;
		}

		// Resolve gray-pending verdicts into agreed/dissent buckets.
		let verifiedBy: 'cosine+llm' | 'cosine-only' = 'cosine+llm';
		const llmAgreed: string[] = [];
		const llmDissented: string[] = [];
		for (const g of pc.grayPending) {
			const verdict = verdictMap.get(g.pair.pairId);
			if (verdict === 'cosine-only') {
				// Was capped — accept on cosine signal (already in gray band, treat
				// as agree) and mark the cluster cosine-only for review.
				llmAgreed.push(g.memberId);
				verifiedBy = 'cosine-only';
			} else if (verdict === 'agree') {
				llmAgreed.push(g.memberId);
			} else {
				llmDissented.push(g.memberId);
			}
		}

		const agreedMemberIds = [pc.medoidId, ...pc.autoAccepted, ...llmAgreed];
		const dissentMemberIds = [...pc.autoRejected, ...llmDissented];

		const total = pc.memberIds.length;
		const agreeFrac = agreedMemberIds.length / total;

		if (agreeFrac >= keepThreshold) {
			// Keep the whole cluster — even members the medoid-judge rejected
			// are kept because the cluster as a whole passes. The dissent set is
			// recorded for telemetry only.
			verifiedClusters.push({
				clusterId: pc.clusterId,
				memberIds: pc.memberIds,
				medoidId: pc.medoidId,
				verifiedBy,
				agreedMemberIds,
				dissentMemberIds,
			});
		} else if (agreeFrac >= splitFloor) {
			// Keep the agreed subset as the primary cluster.
			verifiedClusters.push({
				clusterId: pc.clusterId,
				memberIds: agreedMemberIds,
				medoidId: pc.medoidId,
				verifiedBy,
				agreedMemberIds,
				dissentMemberIds,
			});

			// Send the dissenters through complete-linkage refinement to see if
			// any sub-clique survives. Dissenters might form their own coherent
			// group even though they don't agree with the medoid.
			if (dissentMemberIds.length >= 2) {
				try {
					const refined = await refineComponent(
						{
							memberIds: dissentMemberIds,
							texts,
							verdicts: new Map(),
						},
						(pairs) => judgeSemanticEquivalenceCached(pairs, options.judgeOptions),
					);
					llmCallsMade += refined.newVerdicts.length;
					for (const clique of refined.cliques) {
						const cliqueMedoid = pickMedoid(clique, embeddings);
						refinedFromDissent.push({
							clusterId: `${pc.clusterId}__split_${refinedFromDissent.length}`,
							memberIds: clique,
							medoidId: cliqueMedoid,
							verifiedBy: 'cosine+llm',
							agreedMemberIds: clique,
							dissentMemberIds: [],
						});
					}
				} catch (error) {
					logger.warn('twoTierJudge refineComponent failed; dropping dissent split', {
						clusterId: pc.clusterId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		} else {
			droppedClusters.push({
				clusterId: pc.clusterId,
				reason: `agreeFrac=${agreeFrac.toFixed(2)} below splitFloor=${splitFloor}`,
			});
		}
	}

	const stats = {
		inputClusterCount: candidates.length,
		llmCallsMade,
		llmCallsCapped,
		autoAcceptCount,
		autoRejectCount,
		grayBandCount,
		durationMs: Date.now() - startTime,
	};
	logger.info('twoTierJudge.complete', {
		...stats,
		verifiedCount: verifiedClusters.length,
		droppedCount: droppedClusters.length,
		refinedFromDissentCount: refinedFromDissent.length,
	});

	return {
		verifiedClusters,
		droppedClusters,
		refinedFromDissent,
		stats,
	};
}
