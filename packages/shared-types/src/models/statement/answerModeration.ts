import { number, object, optional, string, InferOutput } from 'valibot';

/**
 * The mark an answer carries once the automatic language check has hidden it.
 * Written by the moderateNewAnswer trigger and pinned by firestore.rules. Holds
 * no copy of the text. `statements` is readable by every signed-in user.
 *
 * `reason` is a string rather than a picklist so that a new reason can never
 * make an older client fail to parse the whole statement.
 */
export const AnswerModerationSchema = object({
	reason: string(),
	hiddenAt: number(),
	/** The trigger event that hid the answer; a redelivery of it changes nothing. */
	eventId: string(),
	/** Set when a host restores the answer, which ends the host-only lock. */
	restoredAt: optional(number()),
});

export type AnswerModeration = InferOutput<typeof AnswerModerationSchema>;

export const ANSWER_MODERATION_REASON = 'inappropriate-language';

/** True while the automatic check is what keeps this answer hidden. */
export function isAnswerHeldByModeration(answer: {
	hide?: boolean;
	answerModeration?: AnswerModeration;
}): boolean {
	return (
		answer.hide === true &&
		answer.answerModeration !== undefined &&
		answer.answerModeration.restoredAt === undefined
	);
}
