import type { Evaluation } from '@freedi/shared-types';
import { computeEffectiveTreeVote, flatClusterTree } from './clusterTree';

/**
 * The ONE counting rule for every cluster score (synthesis, topic cluster,
 * claim cluster), no matter which trigger or job recomputes it:
 *
 *   1. A user's direct vote on the cluster itself wins.
 *   2. Else, the user's direct votes on clusters that were absorbed into this
 *      one (`absorbedClusterIds`) count as direct-like votes (averaged if the
 *      user voted on several absorbed clusters).
 *   3. Else, the average of the user's votes on the cluster's members.
 *
 * Each user is counted exactly once.
 *
 * This is the single-level case of the nested rule in `clusterTree.ts`
 * (`computeEffectiveTreeVote`): it builds a one-level tree and delegates, so
 * there is no second copy of the logic. Use the tree version when the
 * cluster's members can themselves be clusters (themes).
 */
export function computeEffectiveClusterVote(
	clusterStatementId: string,
	userEvaluations: Evaluation[],
	absorbedClusterIds: readonly string[] = [],
): number | null {
	if (userEvaluations.length === 0) return null;

	const absorbedSet = new Set(absorbedClusterIds);
	const byStatement = new Map<string, Evaluation>();
	for (const e of userEvaluations) byStatement.set(e.statementId, e);
	const memberIds = [...byStatement.keys()].filter(
		(id) => id !== clusterStatementId && !absorbedSet.has(id),
	);

	return computeEffectiveTreeVote(
		flatClusterTree(clusterStatementId, absorbedClusterIds, memberIds),
		byStatement,
	);
}
