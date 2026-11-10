/**
 * The mark a hidden-by-the-automatic-check answer carries on its own document.
 *
 * It stays after a host restores the answer, so `hide: false` with a marker
 * means "restored". It holds no copy of the text. firestore.rules rejects any
 * client write that sets or changes it, and only the question's host may clear
 * `hide` while it is there.
 */

export const ANSWER_MODERATION_FIELD = 'answerModeration';

/** The existing check answers yes or no, so there is one reason to record. */
export const ANSWER_MODERATION_REASON = 'inappropriate-language';

export interface AnswerModerationMarker {
	reason: typeof ANSWER_MODERATION_REASON;
	hiddenAt: number;
	/** The trigger event that hid the answer; a redelivery of it changes nothing. */
	eventId: string;
}

export function hasAnswerModerationMarker(statement: object): boolean {
	return ANSWER_MODERATION_FIELD in statement;
}

export function isSameModerationEvent(statement: object, eventId: string): boolean {
	const marker = (statement as { [ANSWER_MODERATION_FIELD]?: Partial<AnswerModerationMarker> })[
		ANSWER_MODERATION_FIELD
	];

	return marker?.eventId === eventId;
}
