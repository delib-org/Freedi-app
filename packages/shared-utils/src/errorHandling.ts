/**
 * Error Handling Utilities
 *
 * Provides consistent error handling patterns across all Freedi applications.
 * Replaces generic try-catch blocks with structured error handling that
 * includes operation context, retry logic, and user-friendly messages.
 *
 * This module is environment-agnostic: it works in browsers, Next.js SSR,
 * and Node.js (Firebase Functions). External monitoring (Sentry, etc.) is
 * wired up via `setErrorReporter()` from the logger module.
 */

import {
	AppError,
	AuthenticationError,
	AuthorizationError,
	DatabaseError,
	NetworkError,
	ValidationError,
} from './errorTypes';
import { logger } from './logger';

/**
 * Context attached to every error log entry.
 * All fields except `operation` are optional so callers only supply
 * the IDs that are relevant to their domain.
 */
export interface ErrorContext {
	/** Module and function name, e.g. 'statements.createStatement' */
	operation: string;
	userId?: string;
	statementId?: string;
	documentId?: string;
	paragraphId?: string;
	questionId?: string;
	component?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Log an error with structured context.
 * Replaces bare `console.error(error)` calls throughout the codebase.
 * The error and its context are forwarded to the logger, which in turn
 * forwards to any registered error reporter (Sentry, etc.).
 */
export function logError(error: unknown, context: ErrorContext): void {
	const errorObj = error instanceof Error ? error : new Error(String(error));

	logger.error(`Error in ${context.operation}`, errorObj, {
		...context,
	});
}

/**
 * Higher-order function that wraps an async function with error handling.
 * If the wrapped function throws, the error is logged with the provided
 * context and `undefined` is returned instead of re-throwing.
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
				metadata: { args: args.length > 0 ? args : undefined },
			});

			return undefined;
		}
	};
}

/**
 * Higher-order function that wraps a synchronous function with error handling.
 * If the wrapped function throws, the error is logged with the provided
 * context and `undefined` is returned instead of re-throwing.
 */
export function withErrorHandlingSync<T extends unknown[], R>(
	fn: (...args: T) => R,
	context: Omit<ErrorContext, 'metadata'>,
): (...args: T) => R | undefined {
	return (...args: T): R | undefined => {
		try {
			return fn(...args);
		} catch (error) {
			logError(error, {
				...context,
				metadata: { args: args.length > 0 ? args : undefined },
			});

			return undefined;
		}
	};
}

/**
 * Options for the retry wrapper.
 */
export interface RetryOptions {
	/** Maximum number of attempts (including the first try). */
	maxRetries: number;
	/** Base delay between retries in milliseconds. */
	delayMs: number;
	/** When true, delay doubles on each subsequent retry. */
	exponentialBackoff?: boolean;
	/** Optional callback invoked before each retry. */
	onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Retry wrapper for transient failures (network blips, DB timeouts, etc.).
 * After exhausting all retries the last error is logged and re-thrown.
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions,
	context: ErrorContext,
): Promise<T> {
	const { maxRetries, delayMs, exponentialBackoff = false, onRetry } = options;
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			if (attempt === maxRetries) {
				break;
			}

			const delay = exponentialBackoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;

			logger.info(`Retrying ${context.operation}`, {
				attempt: attempt as unknown as string,
				maxRetries: maxRetries as unknown as string,
				delay: delay as unknown as string,
				...context,
			});

			if (onRetry) {
				onRetry(attempt, error);
			}

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	logError(lastError, {
		...context,
		metadata: { maxRetries, failedAfterRetries: true },
	});
	throw lastError;
}

/**
 * Check whether an error is recoverable (safe to retry).
 * AppError instances carry an explicit `recoverable` flag.
 * Native errors whose message contains "network" are assumed recoverable.
 */
export function isRecoverableError(error: unknown): boolean {
	if (error instanceof AppError) {
		return error.recoverable;
	}

	if (error instanceof Error && error.message.includes('network')) {
		return true;
	}

	return false;
}

/**
 * Safely extract a human-readable message from an unknown thrown value.
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
 * Map an error to a user-friendly message suitable for display in the UI.
 * Avoids leaking implementation details to end users.
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
	if (error instanceof ValidationError) {
		return 'Please check your input and try again.';
	}
	if (error instanceof AuthenticationError) {
		return 'Please sign in to continue.';
	}
	if (error instanceof AuthorizationError) {
		return 'You do not have permission to perform this action.';
	}
	if (error instanceof NetworkError) {
		return 'Network error. Please check your connection and try again.';
	}
	if (error instanceof DatabaseError) {
		return 'Unable to save changes. Please try again.';
	}

	return 'An unexpected error occurred. Please try again.';
}
