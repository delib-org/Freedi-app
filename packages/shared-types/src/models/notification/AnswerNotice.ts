import { object, string, number, optional, InferOutput } from 'valibot';

/**
 * Server-only record of the notices sent about one answer, at
 * `answerNoticeState/{statementId}`. It is kept off the statement so that
 * recording a notice does not rewrite the option and fire its triggers again.
 *
 * The baseline is the rater count and score at the last "Update on your answer"
 * notice (or when the answer first reached the minimum raters). The two
 * counters mirror the cap slots so most ratings can stop on one read; the slots
 * in `noticeCapSlots` are what actually enforce the caps.
 */
export const AnswerNoticeStateSchema = object({
	statementId: string(),
	baselineRaters: optional(number()),
	baselineConsensus: optional(number()),
	lastNoticeAt: optional(number()),
	noticesSent: optional(number()),
	/** Skip further checks until this time, after a check that could not send. */
	quietUntil: optional(number()),
	lastUpdate: number(),
});

export type AnswerNoticeState = InferOutput<typeof AnswerNoticeStateSchema>;

/**
 * One used slot of a notice cap, at `noticeCapSlots/{key}_{bucket}_{slot}`.
 * Its deterministic id means two senders cannot both take the same slot.
 */
export const NoticeCapSlotSchema = object({
	key: string(),
	queueItemId: string(),
	createdAt: number(),
});

export type NoticeCapSlot = InferOutput<typeof NoticeCapSlotSchema>;
