import { findClustersAffectedByEvaluation, recomputeClusterEvaluation } from './aggregation';
import { logError } from '../utils/errorHandling';

/**
 * Body of `onEvaluationChangeRecomputeCondensationClusters`: recompute every
 * cluster whose score depends on an evaluation of `statementId`.
 *
 * It goes through `recomputeClusterEvaluation`, the same function the
 * live-synth flusher (`recomputeSynthCluster`) calls,
 * so all writers apply one counting rule (see `clusterVoteRule.ts`).
 *
 * One failing cluster never blocks the others. Returns the cluster ids that
 * were recomputed successfully.
 */
export async function recomputeAffectedClusters(statementId: string): Promise<string[]> {
	const affected = await findClustersAffectedByEvaluation(statementId);
	const recomputed: string[] = [];

	for (const clusterId of affected) {
		try {
			await recomputeClusterEvaluation(clusterId);
			recomputed.push(clusterId);
		} catch (error) {
			logError(error, {
				operation: 'onEvaluationChangeRecomputeCondensationClusters.recompute',
				statementId: clusterId,
			});
		}
	}

	return recomputed;
}
