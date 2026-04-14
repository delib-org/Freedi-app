import { object, string, number, array, picklist, InferOutput } from 'valibot';

/**
 * Per-user per-question state after the admin runs "Resolve intents".
 * Stored at: `statements/{questionId}/joinResolutionUsers/{userId}`.
 *
 * - `confirmed`      — user had intents on at most `maxCommitmentsPerUser`
 *                      activated options. No action needed.
 * - `needsPruning`   — user had intents on more activated options than the
 *                      cap; they must keep at most `maxCommitmentsPerUser`.
 *                      The client surfaces a banner/modal until resolved.
 * - `orphaned`       — none of the options the user intented on reached the
 *                      threshold. They see a banner pointing to activated
 *                      options they can still join.
 */
export const JoinResolutionUserStatusSchema = picklist([
	'confirmed',
	'needsPruning',
	'orphaned',
]);
export type JoinResolutionUserStatus = InferOutput<typeof JoinResolutionUserStatusSchema>;

export const JoinResolutionUserSchema = object({
	userId: string(),
	questionId: string(),
	status: JoinResolutionUserStatusSchema,
	/** Option IDs the user had activist intent on that ended up activated. */
	activatedIntents: array(string()),
	maxAllowed: number(),
	createdAt: number(),
	lastUpdate: number(),
});
export type JoinResolutionUser = InferOutput<typeof JoinResolutionUserSchema>;

export const JOIN_RESOLUTION_USERS_SUBCOLLECTION = 'joinResolutionUsers';
