import type { Evaluation } from '@freedi/shared-types';

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
 */
export function computeEffectiveClusterVote(
	clusterStatementId: string,
	userEvaluations: Evaluation[],
	absorbedClusterIds: readonly string[] = [],
): number | null {
	if (userEvaluations.length === 0) return null;

	const direct = userEvaluations.find((e) => e.statementId === clusterStatementId);
	if (direct) return direct.evaluation;

	const absorbedSet = new Set(absorbedClusterIds);
	const absorbedValues = userEvaluations
		.filter((e) => absorbedSet.has(e.statementId))
		.map((e) => e.evaluation);
	if (absorbedValues.length > 0) return average(absorbedValues);

	return average(userEvaluations.map((e) => e.evaluation));
}

function average(values: number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length;
}
