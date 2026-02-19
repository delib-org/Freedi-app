/**
 * Structured Logger
 *
 * Provides a minimal, environment-agnostic logging interface that works in
 * both browser and Node.js runtimes. Uses only console.error and console.info
 * to comply with the project ESLint rules (no console.log / console.warn).
 *
 * Apps can optionally register an external error reporter (e.g. Sentry)
 * via `setErrorReporter()` so that errors are forwarded automatically
 * without this package depending on any monitoring SDK.
 */

/**
 * Structured context attached to every log entry.
 * Callers can pass additional keys through the index signature.
 */
export interface LogContext {
	operation?: string;
	userId?: string;
	statementId?: string;
	documentId?: string;
	paragraphId?: string;
	questionId?: string;
	component?: string;
	metadata?: Record<string, unknown>;
	[key: string]: unknown;
}

/**
 * Callback signature for external error reporters (Sentry, Datadog, etc.).
 * Receives the original error and the structured context so the reporter
 * can tag/scope the event however it needs to.
 */
export type ErrorReporterFn = (error: unknown, context: LogContext) => void;

/**
 * Callback signature for external info reporters.
 * Receives a message string and the structured context.
 */
export type InfoReporterFn = (message: string, context: LogContext) => void;

/** Internal reference to the registered error reporter, if any. */
let _errorReporter: ErrorReporterFn | null = null;

/** Internal reference to the registered info reporter, if any. */
let _infoReporter: InfoReporterFn | null = null;

/**
 * Register an external error reporter that will be called for every
 * `logger.error()` invocation. Pass `null` to remove the reporter.
 *
 * Example with Sentry:
 * ```ts
 * import * as Sentry from '@sentry/nextjs';
 * import { setErrorReporter } from '@freedi/shared-utils';
 *
 * setErrorReporter((error, ctx) => {
 *   Sentry.captureException(error, {
 *     tags: { operation: ctx.operation },
 *     user: ctx.userId ? { id: ctx.userId } : undefined,
 *     extra: ctx.metadata,
 *   });
 * });
 * ```
 */
export function setErrorReporter(reporter: ErrorReporterFn | null): void {
	_errorReporter = reporter;
}

/**
 * Register an external info reporter that will be called for every
 * `logger.info()` invocation. Pass `null` to remove the reporter.
 */
export function setInfoReporter(reporter: InfoReporterFn | null): void {
	_infoReporter = reporter;
}

/**
 * Format a log entry into a human-readable string.
 */
function formatMessage(level: string, message: string, context?: LogContext): string {
	const timestamp = new Date().toISOString();
	const contextStr = context ? ` ${JSON.stringify(context)}` : '';

	return `[${timestamp}] [${level}] ${message}${contextStr}`;
}

/**
 * Structured logger singleton.
 *
 * - `error()` always logs and forwards to the registered error reporter.
 * - `info()` logs informational messages and forwards to the registered info reporter.
 */
export const logger = {
	/**
	 * Log an error. Always emitted regardless of environment.
	 * Also forwarded to the registered error reporter if one is set.
	 */
	error(message: string, error?: Error | unknown, context?: LogContext): void {
		const errorObj = error instanceof Error ? error : new Error(String(error));
		console.error(formatMessage('ERROR', message, context), errorObj);

		if (_errorReporter && context) {
			_errorReporter(error ?? errorObj, context);
		}
	},

	/**
	 * Log an informational message.
	 * Also forwarded to the registered info reporter if one is set.
	 */
	info(message: string, context?: LogContext): void {
		console.info(formatMessage('INFO', message, context));

		if (_infoReporter && context) {
			_infoReporter(message, context);
		}
	},
};
