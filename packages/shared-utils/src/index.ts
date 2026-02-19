/**
 * @freedi/shared-utils
 *
 * Shared utilities for all Freedi applications.
 * Provides error handling, structured logging, and common constants.
 */

// Error types
export {
	AppError,
	AuthenticationError,
	AuthorizationError,
	DatabaseError,
	NetworkError,
	ValidationError,
} from './errorTypes';

// Error handling functions
export {
	getErrorMessage,
	getUserFriendlyErrorMessage,
	isRecoverableError,
	logError,
	withErrorHandling,
	withErrorHandlingSync,
	withRetry,
} from './errorHandling';

// Re-export the ErrorContext and RetryOptions types
export type { ErrorContext, RetryOptions } from './errorHandling';

// Logger
export { logger, setErrorReporter, setInfoReporter } from './logger';
export type { ErrorReporterFn, InfoReporterFn, LogContext } from './logger';

// Shared constants
export { CACHE, ERROR_MESSAGES, FIREBASE, RETRY, TIME, VALIDATION } from './constants';
