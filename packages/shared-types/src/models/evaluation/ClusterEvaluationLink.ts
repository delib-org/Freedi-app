import { array, InferOutput, number, object, optional, string } from 'valibot';

/**
 * Provenance record: one document per (clusterId, userId) pair, describing
 * every raw evaluation a user contributed to a cluster's aggregated score.
 *
 * Written by `functions/src/condensation/aggregation.ts` alongside the
 * cluster's `StatementEvaluation` writeback. The raw `Evaluation` docs are
 * the single source of truth — these link docs are a queryable summary so
 * admins can see per-cluster breakdowns and (in a future UI) users can see
 * where their votes went and remove them.
 *
 * Document ID convention: `${clusterId}__${userId}` (composite).
 */
export const ClusterEvaluationLinkSchema = object({
	linkId: string(),
	clusterId: string(),
	userId: string(),
	parentStatementId: string(),
	/** Evaluations on originals that contributed to this cluster for this user. */
	inheritedFrom: array(
		object({
			evaluationId: string(),
			sourceStatementId: string(),
			value: number(),
			updatedAt: number(),
		}),
	),
	/** Direct evaluation on the cluster itself (optional). */
	direct: optional(
		object({
			evaluationId: string(),
			value: number(),
			updatedAt: number(),
		}),
	),
	/** Per-user average used in the cluster's aggregated score. */
	aggregatedValue: number(),
	/** Total votes contributed: inheritedFrom.length + (direct ? 1 : 0). */
	contributionCount: number(),
	createdAt: number(),
	updatedAt: number(),
});

export type ClusterEvaluationLink = InferOutput<typeof ClusterEvaluationLinkSchema>;

export function getClusterEvaluationLinkId(clusterId: string, userId: string): string {
	return `${clusterId}__${userId}`;
}
