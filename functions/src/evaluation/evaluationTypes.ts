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

// In-memory cache to track recently processed events (helps with immediate retries)
// This is per-instance, so it's not perfect but catches most duplicates
const processedEvents = new Map<string, number>();
const EVENT_CACHE_TTL_MS = 60000; // 1 minute

export function isEventAlreadyProcessed(eventId: string): boolean {
	const processedAt = processedEvents.get(eventId);
	if (processedAt) {
		// Check if it's still within TTL
		if (Date.now() - processedAt < EVENT_CACHE_TTL_MS) {
			return true;
		}
		// Clean up expired entry
		processedEvents.delete(eventId);
	}

	return false;
}

export function markEventAsProcessed(eventId: string): void {
	processedEvents.set(eventId, Date.now());

	// Periodic cleanup of old entries (every 100 entries)
	if (processedEvents.size > 100) {
		const now = Date.now();
		for (const [key, timestamp] of processedEvents.entries()) {
			if (now - timestamp > EVENT_CACHE_TTL_MS) {
				processedEvents.delete(key);
			}
		}
	}
}
