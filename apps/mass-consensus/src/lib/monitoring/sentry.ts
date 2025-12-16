/**
 * Sentry Error Monitoring Configuration
 *
 * This module provides error tracking and performance monitoring via Sentry.
 * It integrates with the existing error handling utilities.
 *
 * Setup:
 * 1. Add NEXT_PUBLIC_SENTRY_DSN to your environment variables
 * 2. Import and call initSentry() in your app layout
 */

// Note: Import dynamically to avoid issues when Sentry is not installed
type SentryType = typeof import('@sentry/nextjs');
let Sentry: SentryType | null = null;

/**
 * Initialize Sentry with the provided DSN
 * Only initializes in production or when explicitly enabled
 */
export async function initSentry(): Promise<void> {
	const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

	if (!dsn) {
		console.info('[Sentry] No DSN configured, skipping initialization');
		return;
	}

	try {
		// Dynamically import Sentry to avoid build errors if not installed
		Sentry = await import('@sentry/nextjs');

		Sentry.init({
			dsn,
			environment: process.env.NODE_ENV || 'development',

			// Performance monitoring - sample 10% of transactions in production
			tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

			// Session replay for debugging user issues (only in production)
			replaysSessionSampleRate: 0.1,
			replaysOnErrorSampleRate: 1.0,

			// Configure which errors to ignore
			ignoreErrors: [
				// Browser extensions
				/chrome-extension/,
				/moz-extension/,
				// Network errors that are expected
				/Failed to fetch/,
				/NetworkError/,
				/Load failed/,
				// Common third-party errors
				/ResizeObserver/,
			],

			// Don't send PII
			sendDefaultPii: false,

			// Additional context
			beforeSend(event) {
				// Remove potentially sensitive data
				if (event.request?.cookies) {
					delete event.request.cookies;
				}
				return event;
			},
		});

		console.info('[Sentry] Initialized successfully');
	} catch (error) {
		console.error('[Sentry] Failed to initialize:', error);
	}
}

/**
 * Capture an exception with additional context
 */
export function captureException(
	error: unknown,
	context?: {
		operation?: string;
		userId?: string;
		questionId?: string;
		statementId?: string;
		extra?: Record<string, unknown>;
	}
): string | undefined {
	if (!Sentry) {
		return undefined;
	}

	return Sentry.captureException(error, {
		tags: {
			operation: context?.operation,
		},
		user: context?.userId ? { id: context.userId } : undefined,
		extra: {
			questionId: context?.questionId,
			statementId: context?.statementId,
			...context?.extra,
		},
	});
}

/**
 * Capture a message (for non-error events)
 */
export function captureMessage(
	message: string,
	level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
	context?: Record<string, unknown>
): string | undefined {
	if (!Sentry) {
		return undefined;
	}

	return Sentry.captureMessage(message, {
		level,
		extra: context,
	});
}

/**
 * Set user context for subsequent events
 */
export function setUser(
	user: { id: string; email?: string; username?: string } | null
): void {
	if (!Sentry) {
		return;
	}

	Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
	category?: string;
	message: string;
	level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
	data?: Record<string, unknown>;
}): void {
	if (!Sentry) {
		return;
	}

	Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
	name: string,
	op: string
): { finish: () => void } | null {
	if (!Sentry) {
		return null;
	}

	// Use startSpan instead of deprecated startTransaction
	const span = Sentry.startInactiveSpan({
		name,
		op,
	});

	return {
		finish: () => span?.end(),
	};
}

/**
 * Check if Sentry is initialized and ready
 */
export function isSentryEnabled(): boolean {
	return Sentry !== null;
}
