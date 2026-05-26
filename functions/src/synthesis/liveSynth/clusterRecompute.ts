import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, Statement, type Evaluation } from '@freedi/shared-types';
import {
	computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds,
	recomputeClusterEvaluation,
} from '../../condensation/aggregation';
import { updateUserDemographicEvaluation } from '../../fn_polarizationIndex';
import {
	generateSynthesizedProposal,
	mapStatementToWithEvaluation,
} from '../../services/integration-ai-service';
import { embeddingCache } from '../../services/embedding-cache-service';
import { embeddingService } from '../../services/embedding-service';

/**
 * Live-synth cluster recompute pipeline.
 *
 * The synthesis pipeline produces "cluster statements" (Statements with
 * `integratedOptions: string[]` listing their members). When a member option
 * receives a new evaluation — or someone votes directly on the cluster — two
 * things must update reactively:
 *
 *   1. The cluster's denormalized `evaluation.{...}` aggregate, so UI selectors
 *      reading `cluster.consensus / cluster.evaluation.numberOfEvaluators` see
 *      the rolled-up value.
 *   2. The cluster's `polarizationIndex/{clusterId}` document, so the
 *      collaboration-index UI can render demographic-aware MAD scores for the
 *      synth itself (not just for raw member options).
 *
 * Both follow the project's vote-counting model:
 *   - Each evaluator counts ONCE on the cluster.
 *   - If the user has a direct vote on the cluster, that wins.
 *   - Else the user's contribution = average of their member votes.
 *
 * Doing both updates synchronously inside every evaluation trigger would
 * create a write hot-spot when many votes hit the same viral cluster
 * simultaneously. Instead we:
 *
 *   a. Mark the cluster "dirty" by setting `pendingRecomputeAt: Date.now()`
 *      on a queue document `_clusterRecomputeQueue/{clusterId}`. Repeated
 *      writes coalesce because the doc id IS the cluster id (idempotent).
 *   b. A scheduled flusher (`fn_clusterRecomputeFlush`) runs every 60s,
 *      reads the queue, runs `recomputeSynthCluster` once per dirty
 *      cluster, then deletes the queue entry.
 *
 * This module is the read-and-execute side of that pipeline. The trigger
 * side (extending `onCreateEvaluation` / `onUpdateEvaluation`) calls
 * `enqueueClusterRecompute` from this module.
 */

const QUEUE_COLLECTION = '_clusterRecomputeQueue';

// `getFirestore()` is called lazily per-function rather than at module load
// time so unit tests can mock the firebase-admin module. The cost is a
// constant-time function call per invocation; the SDK caches the underlying
// client.
function db() {
	return getFirestore();
}

/**
 * Mark a cluster dirty for the next flusher tick. Idempotent: repeated
 * calls within a flusher window collapse into a single recompute.
 *
 * Failure mode is intentionally fail-open: if the queue write fails, we
 * log and return — a missed enqueue means the cluster's aggregate stays
 * slightly stale until the next vote, which is recoverable by the nightly
 * reconciliation job (Ship 3 §"Reconciliation jobs").
 */
export async function enqueueClusterRecompute(
	clusterId: string,
	reason: string,
	evaluatorId?: string,
): Promise<void> {
	if (!clusterId) return;
	try {
		await db()
			.collection(QUEUE_COLLECTION)
			.doc(clusterId)
			.set(
				{
					clusterId,
					pendingRecomputeAt: Date.now(),
					reason,
					...(evaluatorId ? { lastEvaluatorId: evaluatorId } : {}),
				},
				{ merge: true },
			);
	} catch (error) {
		logger.warn('clusterRecompute.enqueue failed', {
			clusterId,
			reason,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Find every cluster (Statement with non-empty `integratedOptions`) that
 * lists `memberStatementId` as a member. A member can in principle belong
 * to multiple clusters; we return them all so the caller can enqueue each.
 */
export async function findClustersContainingMember(
	memberStatementId: string,
): Promise<Statement[]> {
	if (!memberStatementId) return [];
	try {
		const snap = await db()
			.collection(Collections.statements)
			.where('integratedOptions', 'array-contains', memberStatementId)
			.get();

		return snap.docs.map((d) => d.data() as Statement);
	} catch (error) {
		// Index missing on `integratedOptions` would surface here. Log + return
		// empty so the calling trigger can complete its primary path. Operator
		// runs `firebase deploy --only firestore:indexes` to fix.
		logger.warn('clusterRecompute.findClustersContainingMember failed', {
			memberStatementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return [];
	}
}

/**
 * Compute one evaluator's effective vote on a cluster, per the live-synth
 * vote-counting model: direct vote wins; otherwise average of member votes.
 *
 * Returns null when the user has no relevant evaluations (in which case
 * the polarization recompute should skip them — they don't belong on this
 * cluster's MAD breakdown).
 */
export function computeEffectiveVote(
	clusterStatementId: string,
	userEvaluations: Evaluation[],
): number | null {
	if (userEvaluations.length === 0) return null;
	const direct = userEvaluations.find((e) => e.statementId === clusterStatementId);
	if (direct) return direct.evaluation;
	const memberValues = userEvaluations
		.filter((e) => e.statementId !== clusterStatementId)
		.map((e) => e.evaluation);
	if (memberValues.length === 0) return null;

	return memberValues.reduce((a, b) => a + b, 0) / memberValues.length;
}

interface RecomputeResult {
	clusterId: string;
	updated: boolean;
	evaluatorCount: number;
	consensus: number;
	titleRegenerated?: boolean;
}

/**
 * Synth-only: regenerate the AI-authored title/description to reflect the
 * current member set, then re-embed the cluster so future vector searches
 * use the fresh text. Topic clusters don't refresh — their label is
 * intentionally stable.
 *
 * Idempotent: short-circuits when `lastTitleRegeneratedMembers` already
 * equals the current member count. Fail-open: if the LLM refuses or the
 * call throws, we keep the existing title and continue (logged, not
 * thrown). The next member arrival will re-attempt the regen.
 */
async function maybeRegenerateSynthTitle(cluster: Statement, clusterId: string): Promise<boolean> {
	const flags = cluster as Statement & {
		lastTitleRegeneratedMembers?: number;
	};
	if (cluster.derivedByPipeline !== 'synthesis') {
		// Topic clusters don't refresh their label.
		return false;
	}
	const members = cluster.integratedOptions ?? [];
	if (members.length < 2) return false;
	if (flags.lastTitleRegeneratedMembers === members.length) return false;

	// Fetch member option docs in one round-trip via getAll.
	const memberRefs = members.map((id) =>
		db().collection(Collections.statements).doc(id),
	);
	const memberSnaps = await db().getAll(...memberRefs);
	const memberStatements = memberSnaps
		.filter((s) => s.exists)
		.map((s) => s.data() as Statement);
	if (memberStatements.length < 2) return false;

	// Use the parent question as context, matching the spawn-path prompt.
	const parentSnap = await db()
		.collection(Collections.statements)
		.doc(cluster.parentId)
		.get();
	const questionContext = parentSnap.exists
		? (parentSnap.data() as Statement).statement || cluster.parentId
		: cluster.parentId;

	let proposal: Awaited<ReturnType<typeof generateSynthesizedProposal>>;
	try {
		proposal = await generateSynthesizedProposal(
			memberStatements.map(mapStatementToWithEvaluation),
			questionContext,
		);
	} catch (error) {
		logger.warn('recomputeSynthCluster: title regen LLM failed; keeping current title', {
			clusterId,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}

	if (proposal.cannotSynthesize === true) {
		// LLM judges the current member set can no longer synthesize. Keep
		// the existing title (it's the best we have). Log so an admin can
		// review whether the cluster has drifted off-topic.
		logger.info('recomputeSynthCluster: cannotSynthesize on regen; preserving title', {
			clusterId,
			memberCount: memberStatements.length,
			reason: proposal.reason,
		});

		return false;
	}

	const now = Date.now();
	try {
		await db().collection(Collections.statements).doc(clusterId).update({
			statement: proposal.title,
			description: proposal.description ?? '',
			lastTitleRegeneratedMembers: memberStatements.length,
			lastTitleRegeneratedAt: now,
			lastUpdate: now,
		});
	} catch (error) {
		logger.warn('recomputeSynthCluster: title-update write failed', {
			clusterId,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}

	// Re-embed the synth so future neighbor queries use the fresh title.
	// Without this, the cluster keeps matching by its founding-pair
	// embedding even though its display text has moved on.
	try {
		const newEmbedding = await embeddingService.generateEmbedding(
			proposal.title,
			cluster.parentId,
		);
		await embeddingCache.saveEmbedding(
			clusterId,
			newEmbedding.embedding,
			cluster.parentId,
			proposal.title,
		);
	} catch (error) {
		logger.warn('recomputeSynthCluster: re-embed after title regen failed', {
			clusterId,
			error: error instanceof Error ? error.message : String(error),
		});
		// Non-fatal — title is written; embedding will lag until next regen.
	}

	logger.info('recomputeSynthCluster: title regenerated', {
		clusterId,
		memberCount: memberStatements.length,
		titlePreview: proposal.title.substring(0, 80),
	});

	return true;
}

/**
 * Recompute a single cluster's denormalized evaluation aggregate AND fan
 * out per-evaluator polarization-index updates so the demographic MAD
 * breakdown stays current. Reuses existing primitives:
 *
 *   - `recomputeClusterEvaluation` writes `statements/{clusterId}.evaluation`
 *     using `computeClusterEvaluationFromRawEvals` with `directVoteWins:
 *     true`.
 *   - `updateUserDemographicEvaluation` writes
 *     `polarizationIndex/{clusterId}` with per-group MAD math from
 *     `madCalculation.ts`. We call it once per evaluator, passing the
 *     evaluator's *effective* vote on the cluster so direct-wins is honored.
 *
 * Pure read-and-write — no triggers fire on the queue document because the
 * flusher deletes them after success. Returns telemetry so the flusher
 * can log per-cluster work without re-querying.
 */
export async function recomputeSynthCluster(clusterId: string): Promise<RecomputeResult> {
	const clusterDoc = await db().collection(Collections.statements).doc(clusterId).get();
	if (!clusterDoc.exists) {
		return { clusterId, updated: false, evaluatorCount: 0, consensus: 0 };
	}
	const cluster = clusterDoc.data() as Statement;
	const integrated = cluster.integratedOptions ?? [];
	if (integrated.length === 0) {
		// Not a cluster (or cluster was dissolved between enqueue and flush).
		// Nothing to do — return without touching aggregates.
		return { clusterId, updated: false, evaluatorCount: 0, consensus: 0 };
	}

	// 1. Recompute the cluster's denormalized `evaluation.{...}` aggregate.
	//    This re-uses the existing condensation primitive; we pass directVoteWins
	//    so the live-synth model applies. Marking it as a cluster (via
	//    isCluster=true) is required by `recomputeClusterEvaluation`'s guard,
	//    so we patch that field if it's missing.
	if (cluster.isCluster !== true) {
		try {
			await db().collection(Collections.statements).doc(clusterId).update({ isCluster: true });
		} catch (error) {
			logger.warn('recomputeSynthCluster: failed to set isCluster flag', {
				clusterId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	const aggregateEvaluation = await recomputeClusterEvaluation(clusterId, {
		directVoteWins: true,
		clusterStatementId: clusterId,
	});

	// 2. For every evaluator who has touched the cluster (direct or via a
	//    member), recompute the polarization-index entry for THIS cluster
	//    with their effective vote. Reuses the standard demographic-aware
	//    machinery — no new MAD math.
	const sourceIds = [clusterId, ...integrated];
	const allEvals = await fetchEvaluationsForIds(sourceIds);

	// Group the raw evaluations per evaluator so we can compute the
	// effective vote ONCE per user.
	const byUser = new Map<string, Evaluation[]>();
	for (const e of allEvals) {
		if (!e.evaluatorId) continue;
		const bucket = byUser.get(e.evaluatorId);
		if (bucket) bucket.push(e);
		else byUser.set(e.evaluatorId, [e]);
	}

	let evaluatorCount = 0;
	for (const [userId, userEvals] of byUser.entries()) {
		const effective = computeEffectiveVote(clusterId, userEvals);
		if (effective === null) continue;
		evaluatorCount += 1;
		// Find the most recent demographicAnchorId from this user's evals
		// so the polarization compute can resolve their demographics
		// without re-walking ancestors.
		const anchored = userEvals
			.filter((e) => Boolean(e.demographicAnchorId))
			.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
		try {
			await updateUserDemographicEvaluation(cluster, {
				userId,
				evaluation: effective,
				demographicAnchorId: anchored?.demographicAnchorId,
			});
		} catch (error) {
			// One failed evaluator shouldn't sink the whole recompute.
			logger.warn('recomputeSynthCluster: per-evaluator polarization update failed', {
				clusterId,
				userId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	// 3. Synth-only: regenerate the AI-authored title to reflect the current
	//    member set, then re-embed. Topic clusters skip this entirely (see
	//    maybeRegenerateSynthTitle). Idempotent + fail-open.
	const titleRegenerated = await maybeRegenerateSynthTitle(cluster, clusterId);

	return {
		clusterId,
		updated: aggregateEvaluation !== null,
		evaluatorCount,
		consensus: aggregateEvaluation?.agreement ?? 0,
		titleRegenerated,
	};
}

/**
 * Sanity check used by the flusher and tests: ensure the `byUser` /
 * effective-vote calculation matches what the aggregator would produce.
 * Exposed so flusher logs include per-cluster correctness telemetry.
 */
export function debugAggregatePreview(
	clusterStatementId: string,
	evals: Evaluation[],
): { numberOfEvaluators: number; sumEvaluations: number } {
	const { evaluation } = computeClusterEvaluationFromRawEvals(evals, {
		directVoteWins: true,
		clusterStatementId,
	});

	return {
		numberOfEvaluators: evaluation.numberOfEvaluators,
		sumEvaluations: evaluation.sumEvaluations,
	};
}

export const __INTERNAL = { QUEUE_COLLECTION };
