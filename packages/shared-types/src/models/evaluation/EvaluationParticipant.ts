import { object, string, number, InferOutput } from 'valibot';

/**
 * One document per (question, user) pair that has ever evaluated one of the
 * question's options. Server-only: written by the evaluation triggers through
 * the Admin SDK, never read or written by clients.
 *
 * Its existence is the "already counted" marker behind
 * `Statement.evaluation.asParentTotalEvaluators` / `Statement.totalEvaluators`.
 * Once created it is never removed by ordinary evaluation processing, so a
 * participant stays counted even after deleting all their evaluations.
 */
export const EvaluationParticipantSchema = object({
	/** The question whose options were evaluated (Evaluation.parentId). */
	parentId: string(),
	/** The evaluator's uid (Evaluation.evaluator.uid). */
	userId: string(),
	/** Milliseconds since epoch when the user was first counted. */
	createdAt: number(),
});

export type EvaluationParticipant = InferOutput<typeof EvaluationParticipantSchema>;

/** Document id: `{parentId}--{userId}` (same convention as `{uid}--{statementId}`); the uid is URI-encoded so a stray "/" can never split the path. */
export function getEvaluationParticipantId(parentId: string, userId: string): string {
	return `${parentId}--${encodeURIComponent(userId)}`;
}
