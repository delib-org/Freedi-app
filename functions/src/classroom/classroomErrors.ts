import { HttpsError, FunctionsErrorCode } from 'firebase-functions/v2/https';
import { logError } from '../utils/errorHandling';

/** Refusals the client treats specially instead of showing a generic error. */
export type ClassroomErrorReason =
	| 'already-asked'
	| 'already-passed'
	| 'turn-claimed'
	| 'talk-not-over'
	| 'all-asked'
	| 'not-speaker'
	| 'minute-over'
	| 'no-question'
	| 'question-used'
	| 'floor-taken'
	| 'already-answered'
	| 'others-first'
	| 'lesson-ended'
	| 'not-table-talk'
	| 'no-ballot'
	| 'vote-running'
	| 'vote-closed'
	| 'last-candidate'
	| 'reply-too-long';

/**
 * A refusal the engine's pure logic raises. It carries the callable error code
 * so the pure modules stay free of the firebase-functions runtime (testable in
 * plain Jest) while the callables still answer with a precise HttpsError.
 */
export class ClassroomError extends Error {
	readonly code: FunctionsErrorCode;
	/** Machine-readable cause the client can branch on (e.g. 'turn-claimed'). */
	readonly reason?: ClassroomErrorReason;

	constructor(code: FunctionsErrorCode, message: string, reason?: ClassroomErrorReason) {
		super(message);
		this.name = 'ClassroomError';
		this.code = code;
		this.reason = reason;
	}
}

interface FailureContext {
	operation: string;
	userId?: string;
	statementId?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Turn whatever a callable body threw into the HttpsError the client sees.
 * Deliberate refusals pass through with their code; anything else is logged
 * with context and answered with a bare `internal` (no stack, no internals).
 */
export function toHttpsError(error: unknown, context: FailureContext): HttpsError {
	if (error instanceof HttpsError) return error;
	if (error instanceof ClassroomError) {
		return error.reason
			? new HttpsError(error.code, error.message, { reason: error.reason })
			: new HttpsError(error.code, error.message);
	}
	logError(error, context);

	return new HttpsError('internal', 'The classroom request failed');
}
