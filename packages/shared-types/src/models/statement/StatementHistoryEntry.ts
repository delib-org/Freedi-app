import { InferOutput, literal, number, object, optional, string, union } from 'valibot';
import { StatementEvaluationSchema } from '../evaluation/Evaluation';

export const StatementHistorySourceSchema = union([
	literal('snapshot'),         // hourly scheduled sample (all statements)
	literal('text-change'),      // title or description diff (all statements)
	literal('evaluation-change'),// per-evaluation delta (research mode only)
]);

export type StatementHistorySource = InferOutput<typeof StatementHistorySourceSchema>;

/**
 * A point-in-time record of a statement's evaluation aggregates and/or text.
 *
 * Written to the subcollection `statements/{statementId}/statementHistory/{entryId}`.
 *
 * - `source = 'snapshot'`: hourly scheduled snapshot of active statements.
 * - `source = 'text-change'`: fires when title/description actually differ.
 * - `source = 'evaluation-change'`: fires on every evaluation create/update/delete,
 *   ONLY when the top parent has `enableResearchLogging = true`. No user identifier
 *   is stored — only the resulting aggregated evaluation numbers and the delta.
 *
 * `isResearch` marks entries that belong to a research-enabled tree, so the
 * retention job can skip them when pruning non-research history.
 */
export const StatementHistoryEntrySchema = object({
	entryId: string(),
	statementId: string(),
	topParentId: optional(string()),
	createdAt: number(),
	source: StatementHistorySourceSchema,
	isResearch: optional(number()), // 1 if top parent is research-enabled, else 0
	evaluation: optional(StatementEvaluationSchema),
	// text-change
	statementBefore: optional(string()),
	statementAfter: optional(string()),
	descriptionBefore: optional(string()),
	descriptionAfter: optional(string()),
	// evaluation-change (research only) — aggregate delta, never a user id
	evaluationDelta: optional(number()),
	evaluationAction: optional(union([literal('new'), literal('update'), literal('delete')])),
});

export type StatementHistoryEntry = InferOutput<typeof StatementHistoryEntrySchema>;
