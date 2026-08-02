import * as Sentry from '@sentry/react';
import { useLocation, useNavigationType } from 'react-router';
import React, { useEffect } from 'react';
import { logError } from '@/utils/errorHandling';

// Null-dereference messages the Firestore SDK throws from its own persistence /
// target layer (`removeTarget`, LRU garbage collection). Harmless to drop only
// when the frames really are inside the Firestore bundle — see isFirestoreInternalCrash.
const FIRESTORE_INTERNAL_MESSAGES = [
	'INTERNAL ASSERTION FAILED',
	"Cannot read properties of null (reading 'target')",
	"Cannot read properties of null (reading 'withSequenceNumber')",
];

/**
 * True when the event is one of the Firestore SDK's internal persistence crashes.
 * Requires both a known message and a stack rooted in the Firestore vendor chunk,
 * so app-code null-dereferences with a similar message still get reported.
 */
function isFirestoreInternalCrash(event: Sentry.ErrorEvent, error: unknown): boolean {
	const messages: string[] = [];
	if (error instanceof Error && error.message) messages.push(error.message);
	event.exception?.values?.forEach((exc) => {
		if (exc.value) messages.push(exc.value);
	});

	const hasKnownMessage = messages.some((msg) =>
		FIRESTORE_INTERNAL_MESSAGES.some((known) => msg.includes(known)),
	);
	if (!hasKnownMessage) return false;

	const frames = event.exception?.values?.flatMap((exc) => exc.stacktrace?.frames ?? []) ?? [];
	if (frames.length === 0) {
		// Assertion errors carry their own unmistakable prefix even without a stack.
		return messages.some((msg) => msg.includes('INTERNAL ASSERTION FAILED'));
	}

	return frames.every((frame) => (frame.filename ?? '').includes('vendor-firebase'));
}

/**
 * True when the event is workbox-window dereferencing a registration that
 * `serviceWorker.register()` never returned. Privacy extensions and automation
 * harnesses stub register() so it resolves undefined; the crash happens inside
 * the minified workbox bundle, so app code can't guard it. Requires both the
 * null-deref message and a stack rooted entirely in workbox-window, so real
 * app-code dereferences with a similar message still get reported.
 */
function isBlockedServiceWorkerCrash(event: Sentry.ErrorEvent, error: unknown): boolean {
	const messages: string[] = [];
	if (error instanceof Error && error.message) messages.push(error.message);
	event.exception?.values?.forEach((exc) => {
		if (exc.value) messages.push(exc.value);
	});

	const hasKnownMessage = messages.some((msg) =>
		/Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '(?:waiting|installing|active)'\)|(?:undefined|null) is not an object \(evaluating '.*\.(?:waiting|installing|active)'\)/.test(
			msg,
		),
	);
	if (!hasKnownMessage) return false;

	const frames = event.exception?.values?.flatMap((exc) => exc.stacktrace?.frames ?? []) ?? [];
	if (frames.length === 0) return false;

	return frames.every((frame) => (frame.filename ?? '').includes('workbox-window'));
}

export function initSentry() {
	const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

	// Only initialize in production and if we have a valid DSN
	if (
		import.meta.env.PROD &&
		sentryDsn &&
		sentryDsn !== 'YOUR_SENTRY_DSN_HERE' &&
		sentryDsn.startsWith('https://')
	) {
		Sentry.init({
			dsn: sentryDsn,
			environment: import.meta.env.VITE_ENVIRONMENT || 'production',
			integrations: [Sentry.browserTracingIntegration()],
			// Performance Monitoring
			tracesSampleRate: 0.1, // Capture 10% of transactions for performance monitoring

			// Release tracking
			release: import.meta.env.VITE_APP_VERSION || '1.0.11',

			// Filter out non-critical errors
			beforeSend(event, hint) {
				// Filter out cancelled requests
				const error = hint.originalException;
				if (error instanceof Error && error.message?.includes('cancelled')) {
					return null;
				}

				// Filter out Firestore offline errors — not actionable, happens
				// constantly on flaky mobile networks
				const firebaseErr = error as { name?: string; code?: string } | undefined;
				if (firebaseErr?.name === 'FirebaseError' && firebaseErr?.code === 'unavailable') {
					return null;
				}

				// Filter out IndexedDB errors (handled by indexedDBErrorHandler)
				if (error instanceof Error) {
					const msg = error.message;
					if (
						msg.includes('IndexedDB') ||
						msg.includes('indexedDB') ||
						msg.includes('backing store for indexedDB') ||
						error.name === 'IndexedDbTransactionError' ||
						error.name === 'UnknownError' ||
						error.name === 'QuotaExceededError'
					) {
						return null;
					}
				}

				// Fallback: check event exception values directly (covers cases where
				// hint.originalException is undefined or not an Error instance)
				const exceptionValues = event.exception?.values;
				if (
					exceptionValues?.some((exc) => {
						const val = `${exc.type ?? ''}: ${exc.value ?? ''}`;

						return (
							val.includes('IndexedDB') ||
							val.includes('indexedDB') ||
							val.includes('backing store') ||
							val.includes('QuotaExceededError') ||
							exc.type === 'UnknownError' ||
							exc.type === 'IndexedDbTransactionError'
						);
					})
				) {
					return null;
				}

				// Filter out the Firestore SDK's internal persistence crashes.
				// These fire from inside the minified Firestore bundle when its local
				// target/persistence layer gets into a bad state. They are not fixable
				// from app code and repeat dozens of times per bad session.
				// `indexedDBErrorHandler` catches them, records the failure so the next
				// load uses the memory cache, and reports a single structured event
				// instead — that is the signal to watch.
				if (isFirestoreInternalCrash(event, error)) {
					return null;
				}

				// Filter out workbox-window crashes caused by a stubbed
				// serviceWorker.register(). Not fixable from app code.
				if (isBlockedServiceWorkerCrash(event, error)) {
					return null;
				}

				// Filter out network errors in development
				if (
					import.meta.env.DEV &&
					error instanceof Error &&
					error.message?.includes('NetworkError')
				) {
					return null;
				}

				// Don't send events with no error
				if (!event.exception && !event.message) {
					return null;
				}

				return event;
			},

			// Ignore specific errors
			ignoreErrors: [
				// Browser extensions
				'top.GLOBALS',
				'ResizeObserver loop limit exceeded',
				'Non-Error promise rejection captured',
				// Network errors
				'Network request failed',
				'NetworkError',
				'Failed to fetch',
				// Firebase errors that are handled
				'permission-denied',
				// Firestore offline — user device lost connection, not actionable
				'Failed to get document because the client is offline',
				'Could not reach Cloud Firestore backend',
				// IndexedDB errors - handled by indexedDBErrorHandler
				'IndexedDbTransactionError',
				'IndexedDB transaction',
				'Internal error opening backing store for indexedDB.open',
				'QuotaExceededError',
				/UnknownError.*indexedDB/i,
				/backing store/i,
			],
		});
	}
}

// Enhanced error capture with context
export function captureException(error: Error, context?: Record<string, unknown>) {
	if (import.meta.env.DEV) {
		logError(new Error('Error captured:'), {
			operation: 'services.monitoring.sentry.captureException',
			metadata: { detail: error, context },
		});

		return;
	}

	Sentry.withScope((scope) => {
		if (context) {
			scope.setContext('additional', context);
		}

		// Add pseudonymized user context — no PII (email/username) sent to third-party
		try {
			const userString = localStorage.getItem('user');
			if (userString) {
				const user = JSON.parse(userString);
				scope.setUser({
					id: user.uid,
				});
			}
		} catch {
			// Ignore parsing errors
		}

		// Add breadcrumb
		scope.addBreadcrumb({
			message: 'Error occurred',
			level: 'error',
			data: context,
			timestamp: Date.now(),
		});

		Sentry.captureException(error);
	});
}

// React Router instrumentation helper
export function withSentryRouting<T extends React.ComponentType<React.ComponentProps<T>>>(
	Component: T,
): T {
	return Sentry.withSentryRouting(Component);
}

// Custom hook for route tracking
export function useSentryRouteTracking() {
	const location = useLocation();
	const navigationType = useNavigationType();

	useEffect(() => {
		if (import.meta.env.PROD) {
			Sentry.addBreadcrumb({
				category: 'navigation',
				message: `Navigated to ${location.pathname}`,
				level: 'info',
				data: {
					from: navigationType,
					search: location.search,
				},
			});
		}
	}, [location, navigationType]);
}
