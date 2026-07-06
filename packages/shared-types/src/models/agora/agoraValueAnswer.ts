import {
	object,
	string,
	number,
	optional,
	array,
	InferOutput,
} from 'valibot';

/**
 * A student's free-text answer identifying a character's values,
 * graded asynchronously by AI. Doc id: `${sessionId}--${uid}--${characterId}`.
 */
export const AgoraValueAnswerSchema = object({
	answerId: string(),
	sessionId: string(),
	userId: string(),
	characterId: string(),
	answerText: string(),
	/** AI grading fields — written by Cloud Function only */
	aiScore: optional(number()),
	aiFeedback: optional(string()),
	matchedValueIds: optional(array(string())),
	gradedAt: optional(number()),
	createdAt: number(),
});

export type AgoraValueAnswer = InferOutput<typeof AgoraValueAnswerSchema>;

export function createAgoraValueAnswerId(
	sessionId: string,
	userId: string,
	characterId: string
): string {
	return `${sessionId}--${userId}--${characterId}`;
}
