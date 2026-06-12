/**
 * Shared Sentry config for both runtimes. `@sentry/sveltekit` resolves to its
 * browser build in `hooks.client.ts` and its node build in `hooks.server.ts`
 * via conditional exports, so this module is safe to import from either side.
 *
 * The DSN is the monorepo-wide Sentry project (same as the main/join apps);
 * chat events are distinguished by the `app: 'chat'` tag.
 */
import * as Sentry from '@sentry/sveltekit';

const dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN;

/** Init only in production builds with a real DSN (dev stays Sentry-free). */
export const sentryEnabled: boolean = import.meta.env.PROD && !!dsn && dsn.startsWith('https://');

/** Options common to the client and server `Sentry.init()` calls. */
export const sharedSentryOptions = {
	dsn,
	environment: (import.meta.env.VITE_ENVIRONMENT as string) || 'production',
	release: (import.meta.env.VITE_APP_VERSION as string) || '0.1.0',
	tracesSampleRate: 0.1,
	initialScope: {
		tags: { app: 'chat' },
	},
} as const;

/** Noise that is not actionable (flaky networks, offline Firestore, etc.). */
export const sharedIgnoreErrors: (string | RegExp)[] = [
	// Browser extensions / engine noise
	'top.GLOBALS',
	'ResizeObserver loop limit exceeded',
	'Non-Error promise rejection captured',
	// Network errors
	'Network request failed',
	'NetworkError',
	'Failed to fetch',
	// Firebase errors that are handled or not actionable
	'permission-denied',
	'Failed to get document because the client is offline',
	'Could not reach Cloud Firestore backend',
	// IndexedDB failures (private mode, low storage) — nothing to fix server-side
	'IndexedDbTransactionError',
	'IndexedDB transaction',
	'Internal error opening backing store for indexedDB.open',
	'QuotaExceededError',
	/UnknownError.*indexedDB/i,
	/backing store/i,
	// Service worker registration rejections — crawlers, private mode,
	// sandboxed browsers; nothing we can do client-side.
	/serviceWorker\.register/i,
	/Failed to register a ServiceWorker/i,
];

/** Capture an exception with optional extra context (no-op when disabled). */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
	if (!sentryEnabled) return;
	Sentry.withScope((scope) => {
		if (context) {
			scope.setContext('additional', context);
		}
		Sentry.captureException(error);
	});
}

/** Attach (or clear) the pseudonymous user id — never email/display name. */
export function setSentryUser(uid: string | null): void {
	if (!sentryEnabled) return;
	Sentry.setUser(uid ? { id: uid } : null);
}
