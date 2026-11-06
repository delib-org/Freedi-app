import { logger } from 'firebase-functions';
import { findClustersAffectedByEvaluation, recomputeClusterEvaluation } from './aggregation';
import { logError } from '../utils/errorHandling';

/** gRPC status code Firestore returns when `.update()` targets a missing document. */
const GRPC_NOT_FOUND = 5;

function isFirestoreNotFound(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { code?: unknown }).code === GRPC_NOT_FOUND
	);
}

/**
 * Body of `onEvaluationChangeRecomputeCondensationClusters`: recompute every
 * cluster whose score depends on an evaluation of `statementId`.
 *
 * It goes through `recomputeClusterEvaluation`, the same function the
 * live-synth flusher (`recomputeSynthCluster`) and the nightly reconcile
 * (`fn_nightlyClusterReconcile`) call,
 * so all writers apply one counting rule (see `clusterVoteRule.ts`).
 *
 * One failing cluster never blocks the others. Returns the cluster ids that
 * were recomputed successfully. A cluster deleted while the trigger was in
 * flight (NOT_FOUND on update) is skipped with an info log, not an error.
 */
export async function recomputeAffectedClusters(statementId: string): Promise<string[]> {
	const affected = await findClustersAffectedByEvaluation(statementId);
	const recomputed: string[] = [];

	for (const clusterId of affected) {
		try {
			await recomputeClusterEvaluation(clusterId);
			recomputed.push(clusterId);
		} catch (error) {
			if (isFirestoreNotFound(error)) {
				logger.info('Cluster deleted before recompute, skipping', {
					operation: 'onEvaluationChangeRecomputeCondensationClusters.recompute',
					statementId: clusterId,
				});
				continue;
			}

			logError(error, {
				operation: 'onEvaluationChangeRecomputeCondensationClusters.recompute',
				statementId: clusterId,
			});
		}
	}

	return recomputed;
}
