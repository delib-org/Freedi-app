/**
 * Error Handling Utilities for Firebase Cloud Functions
 *
 * Provides consistent, structured error handling across the functions codebase.
 * Replaces bare console.error() calls with context-rich logging.
 *
 * Modeled after the main app's src/utils/errorHandling.ts but adapted
 * for the Node.js / Cloud Functions environment.
 */

/**
 * Custom error types for different failure modes.
 * Each carries a machine-readable code and optional structured context.
 */
export class AppError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
		public readonly recoverable: boolean = true,
	) {
		super(message);
		this.name = 'AppError';
	}
}

export class DatabaseError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'DATABASE_ERROR', context, true);
		this.name = 'DatabaseError';
	}
}

export class ValidationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'VALIDATION_ERROR', context, false);
		this.name = 'ValidationError';
	}
}

export class AuthenticationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'AUTHENTICATION_ERROR', context, false);
		this.name = 'AuthenticationError';
	}
}

export class AuthorizationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'AUTHORIZATION_ERROR', context, false);
		this.name = 'AuthorizationError';
	}
}

/**
 * Error context interface - provides structured metadata for every error log.
 */
interface ErrorContext {
	/** Module and function name, e.g. 'clusters.getCluster' */
	operation: string;
	userId?: string;
	statementId?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Log an error with structured context.
 *
 * Uses console.error internally (which Cloud Functions routes to Cloud Logging
 * at ERROR severity) but wraps it in a structured JSON payload so that
 * logs are searchable and filterable in the Google Cloud console.
 */
export function logError(error: unknown, context: ErrorContext): void {
	const errorObj = error instanceof Error ? error : new Error(String(error));

	// Structured log entry for Cloud Logging
	console.info(
		JSON.stringify({
			severity: 'ERROR',
			operation: context.operation,
			message: errorObj.message,
			errorName: errorObj.name,
			userId: context.userId,
			statementId: context.statementId,
			metadata: context.metadata,
			stack: errorObj.stack,
		}),
	);
}

/**
 * Extract a human-readable error message from an unknown thrown value.
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}

	return 'An unknown error occurred';
}

/**
 * Higher-order function that wraps an async Cloud Function handler
 * with structured error handling and logging.
 */
export function withErrorHandling<T extends unknown[], R>(
	fn: (...args: T) => Promise<R>,
	context: Omit<ErrorContext, 'metadata'>,
): (...args: T) => Promise<R | undefined> {
	return async (...args: T): Promise<R | undefined> => {
		try {
			return await fn(...args);
		} catch (error) {
			logError(error, {
				...context,
				metadata: { args: args.length > 0 ? args.length : undefined },
			});

			return undefined;
		}
	};
}
