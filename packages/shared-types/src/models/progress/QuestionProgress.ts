import { InferOutput, number, object, string, optional, boolean } from 'valibot';

/**
 * Per-question participation funnel, maintained server-side by the progress
 * writer in `functions/src/progress/` (transactions from the statement,
 * evaluation and statementViews triggers). Read by the Studio console and
 * by facilitator dashboards; clients never write it.
 *
 * Stored at `questionProgress/{statementId}` (one doc per question).
 *
 * `entered` / `suggested` / `evaluated` are UNIQUE-user counters (flipped at
 * most once per user via `questionParticipation` markers); `options` and
 * `evaluations` are raw event counters.
 */
export const QuestionProgressSchema = object({
	statementId: string(),
	topParentId: string(),
	/** Consultant tenant, copied from the top question for org-scoped queries. */
	organizationId: optional(string()),
	/** Unique users who opened the question. */
	entered: number(),
	/** Unique users who added at least one (non-derived) option. */
	suggested: number(),
	/** Unique users who evaluated at least one option. */
	evaluated: number(),
	/** Total non-derived options under the question. */
	options: number(),
	/** Total evaluation events under the question. */
	evaluations: number(),
	/** Epoch-ms of the most recent counted activity. */
	lastActivity: number(),
	/** Epoch-ms of the last facilitator nudge (rate-limited to once per hour). */
	lastNudgeAt: optional(number()),
	lastUpdate: number(),
});

export type QuestionProgress = InferOutput<typeof QuestionProgressSchema>;

/**
 * Per-(question, user) marker used to keep the unique counters above honest.
 * Stored at `questionParticipation/{statementId}--{userId}`
 * (see getQuestionParticipationId). Server-only: no client read or write.
 */
export const QuestionParticipationSchema = object({
	statementId: string(),
	userId: string(),
	entered: optional(boolean()),
	suggested: optional(boolean()),
	evaluated: optional(boolean()),
});

export type QuestionParticipation = InferOutput<typeof QuestionParticipationSchema>;

/** Build the deterministic doc id for a question-participation marker. */
export function getQuestionParticipationId(statementId: string, userId: string): string {
	return `${statementId}--${userId}`;
}
