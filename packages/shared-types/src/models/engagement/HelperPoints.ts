import { type InferOutput, number, object, string } from 'valibot';

/**
 * Publicly-readable helper-points tally: how many times a user's comments
 * were marked helpful by suggestion authors. Maintained exclusively by the
 * `onCommentVerdictWritten` Cloud Function (client writes are rules-blocked),
 * alongside the credit awarded in the engagement ledger.
 *
 * One doc per (scope, user): scope is a questionId for the per-question
 * tally, or HELPER_POINTS_TOTAL_SCOPE for the user's cross-question total.
 * Doc id: `${scopeId}--${userId}`.
 */
export const HelperPointsSchema = object({
	/** questionId, or HELPER_POINTS_TOTAL_SCOPE for the global tally */
	scopeId: string(),
	userId: string(),
	points: number(),
	lastUpdate: number(),
});

export type HelperPoints = InferOutput<typeof HelperPointsSchema>;

export const HELPER_POINTS_TOTAL_SCOPE = 'total';

export function getHelperPointsId(scopeId: string, userId: string): string {
	return `${scopeId}--${userId}`;
}
