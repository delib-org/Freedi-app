import { HttpsError, FunctionsErrorCode } from 'firebase-functions/v2/https';
import { logError } from '../utils/errorHandling';
import type { TablesErrorReason } from './constants';

/**
 * A refusal the Tables logic raises. Carries the callable error code so the
 * logic modules stay testable in plain Jest while the callables answer with a
 * precise HttpsError.
 */
export class TablesError extends Error {
	readonly code: FunctionsErrorCode;
	readonly reason?: TablesErrorReason;

	constructor(code: FunctionsErrorCode, message: string, reason?: TablesErrorReason) {
		super(message);
		this.name = 'TablesError';
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
 * with context and answered with a bare `internal`.
 */
export function toHttpsError(error: unknown, context: FailureContext): HttpsError {
	if (error instanceof HttpsError) return error;
	if (error instanceof TablesError) {
		return error.reason
			? new HttpsError(error.code, error.message, { reason: error.reason })
			: new HttpsError(error.code, error.message);
	}
	logError(error, context);

	return new HttpsError('internal', 'The Tables request failed');
}
