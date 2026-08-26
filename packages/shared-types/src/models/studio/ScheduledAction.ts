import { InferOutput, array, number, object, optional, picklist, string } from 'valibot';
import { StudioScheduledActionKindSchema } from './StudioPlan';

/**
 * A facilitator action to run at a given time on a question: open / freeze /
 * close (`statementSettings.questionStatus`, mirrored to the MC survey status
 * when the question has one) or send a reminder nudge.
 *
 * Written by `fn_studioPlanBuild` / `fn_studioScheduledActionUpsert`,
 * executed by the `studioScheduledActionSweep` scheduler. Clients read only.
 * Stored at `scheduledActions/{scheduledActionId}`.
 */
export const ScheduledActionStatusSchema = picklist([
	'pending',
	'running',
	'done',
	'failed',
	'cancelled',
]);
export type ScheduledActionStatus = InferOutput<typeof ScheduledActionStatusSchema>;

export const ScheduledNudgeSchema = object({
	message: string(),
	audience: picklist(['all', 'notSuggested', 'notEvaluated']),
	channels: array(picklist(['inApp', 'email'])),
});
export type ScheduledNudge = InferOutput<typeof ScheduledNudgeSchema>;

export const ScheduledActionSchema = object({
	scheduledActionId: string(),
	/** Target: an activity (child question) or the top question itself. */
	statementId: string(),
	topParentId: string(),
	/** Denormalized for the Studio list query and the rules. */
	organizationId: string(),
	action: StudioScheduledActionKindSchema,
	/** Epoch ms. */
	runAt: number(),
	status: ScheduledActionStatusSchema,
	createdBy: string(),
	source: picklist(['plan', 'manual']),
	sessionId: optional(string()),
	/** `nudge` only. */
	nudge: optional(ScheduledNudgeSchema),
	claimedAt: optional(number()),
	executedAt: optional(number()),
	error: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
});
export type ScheduledAction = InferOutput<typeof ScheduledActionSchema>;

/** A `running` claim older than this is considered stale and re-run. */
export const SCHEDULED_ACTION_STALE_CLAIM_MS = 10 * 60 * 1000;
