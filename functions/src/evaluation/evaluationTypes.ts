/**
 * Shared types for evaluation processing.
 *
 * Contains enums, interfaces, and idempotency tracking used
 * across the evaluation module.
 */

import type { Statement, PopperHebbianScore } from '@freedi/shared-types';

// ============================================================================
// TYPES & ENUMS
// ============================================================================

export enum ActionTypes {
	new = 'new',
	update = 'update',
	delete = 'delete',
}

export interface UpdateStatementEvaluationProps {
	statementId: string;
	evaluationDiff: number;
	addEvaluator?: number;
	action: ActionTypes;
	newEvaluation: number;
	oldEvaluation: number;
	userId?: string;
	parentId: string;
	/**
	 * Firestore trigger event id. Used as a durable, transaction-scoped
	 * idempotency key so an at-least-once duplicate delivery cannot
	 * double-apply the FieldValue.increment accumulation.
	 */
	eventId?: string;
}

export interface UpdateStatementEvaluationResult {
	/** The updated statement, or undefined on error / when nothing was applied. */
	statement?: Statement;
	/**
	 * True when this event was already processed (duplicate delivery) and the
	 * increment was intentionally skipped. Callers should short-circuit their
	 * remaining side-effects (e.g. history writes) when this is true.
	 */
	duplicate: boolean;
}

export interface CalcDiff {
	proDiff: number;
	conDiff: number;
	proEvaluatorsDiff: number; // change in count of pro evaluators
	conEvaluatorsDiff: number; // change in count of con evaluators
}

// Extend Statement type to include popperHebbianScore (it exists but TypeScript doesn't see it during compilation)
export type StatementWithPopper = Statement & { popperHebbianScore?: PopperHebbianScore };

// ============================================================================
// IDEMPOTENCY TRACKING
// ============================================================================

// Firebase delivers triggers at-least-once: the same evaluation write can fire
// a handler more than once, sometimes on a different (cold) instance. Because
// the accumulation uses FieldValue.increment, a duplicate delivery would
// permanently inflate the counters. We therefore record a durable marker doc
// keyed by the trigger event id and read/write it INSIDE the same transaction
// that applies the increment — making the increment exactly-once per event.

/** Collection holding processed-event markers for evaluation idempotency. */
export const PROCESSED_EVALUATION_EVENTS_COLLECTION = 'processedEvaluationEvents';

/**
 * How long a processed-event marker is retained. Markers only need to outlive
 * the window in which Firebase may re-deliver the same event (minutes), but we
 * keep a generous buffer. A Firestore TTL policy on the `expireAt` field of the
 * `processedEvaluationEvents` collection should be enabled to auto-purge them.
 */
export const PROCESSED_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Builds a Firestore-safe document id for a processed-event marker.
 *
 * Document ids cannot contain '/', so any are replaced. The id is namespaced by
 * action to avoid any cross-handler collision should a single underlying write
 * ever surface the same event id to more than one handler.
 */
export function buildProcessedEventKey(action: ActionTypes, eventId: string): string {
	return `${action}__${eventId}`.replace(/\//g, '_');
}
