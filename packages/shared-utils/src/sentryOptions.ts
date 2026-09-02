/**
 * One Sentry policy for every Freedi browser app.
 *
 * Builds the options object passed to `Sentry.init()`. Deliberately does NOT
 * import any Sentry package — shared-utils is dependency-free and also runs in
 * Cloud Functions — so each app hands the result to its own SDK:
 *
 *   import * as Sentry from '@sentry/browser';
 *   import { buildSentryOptions } from '@freedi/shared-utils';
 *   Sentry.init(buildSentryOptions({ dsn, app: 'agora', release }));
 *
 * The value of having this in one place is the `beforeSend` policy and the
 * ignore list: those were copied by hand into three apps once and immediately
 * drifted, which is how two of them ended up with no Firestore crash filter at
 * all.
 */

import {
	isBlockedServiceWorkerCrash,
	isFirestoreInternalCrash,
	isTransientAuthNetworkError,
	type SentryLikeEvent,
} from './sentryFilters';

/** Every app that reports to Sentry, as it appears in the `app` tag. */
export type FreediApp =
	| 'main'
	| 'sign'
	| 'mass-consensus'
	| 'join'
	| 'chat'
	| 'admin'
	| 'agora'
	| 'flow'
	| 'odyssey'
	| 'studio';

export interface BuildSentryOptionsArgs {
	dsn: string;
	/** Tags every event, so one Sentry project can still be split by app. */
	app: FreediApp;
	release?: string;
	environment?: string;
	/**
	 * Substrings identifying this app's Firebase bundle, for the Firestore
	 * crash filter. Omit where the bundler gives chunks no stable name.
	 */
	firebaseChunkNames?: readonly string[];
	/** Fraction of transactions sampled for performance. Omit to disable. */
	tracesSampleRate?: number;
}

/** Messages that are noise in every app. */
const SHARED_IGNORE: (string | RegExp)[] = [
	// Browser extensions and benign browser noise
	'top.GLOBALS',
	'ResizeObserver loop limit exceeded',
	'ResizeObserver loop completed with undelivered notifications',
	'Non-Error promise rejection captured',
	// Connectivity — the device's problem, not ours
	'Network request failed',
	'NetworkError',
	'Failed to fetch',
	'Load failed',
	'auth/network-request-failed',
	// Firestore offline
	'Failed to get document because the client is offline',
	'Could not reach Cloud Firestore backend',
	// Rules rejections are handled in-app where they matter
	'permission-denied',
	// IndexedDB — private mode, full disks, blocked storage
	'IndexedDbTransactionError',
	'IndexedDB transaction',
	'Internal error opening backing store for indexedDB.open',
	'QuotaExceededError',
	/UnknownError.*indexedDB/i,
	/backing store/i,
	// Service worker registration rejections: crawlers, private mode, sandboxes
	/serviceWorker\.register/i,
	/Failed to register a ServiceWorker/i,
];

interface BeforeSendHintLike {
	originalException?: unknown;
}

export interface SentryOptionsLike<TEvent extends SentryLikeEvent = SentryLikeEvent> {
	dsn: string;
	environment: string;
	release?: string;
	initialScope: { tags: { app: FreediApp } };
	tracesSampleRate?: number;
	ignoreErrors: (string | RegExp)[];
	beforeSend: (event: TEvent, hint?: BeforeSendHintLike) => TEvent | null;
}

/**
 * Generic in the event type so each app can name its own SDK's event
 * (`Sentry.ErrorEvent`) and pass the result to `Sentry.init()` with no cast.
 * `beforeSend` only ever reads `exception` and `message`, and returns the very
 * event it was handed, so widening is safe.
 */
export function buildSentryOptions<TEvent extends SentryLikeEvent = SentryLikeEvent>(
	args: BuildSentryOptionsArgs,
): SentryOptionsLike<TEvent> {
	const { dsn, app, release, environment = 'production', firebaseChunkNames } = args;

	return {
		dsn,
		environment,
		release,
		initialScope: { tags: { app } },
		tracesSampleRate: args.tracesSampleRate,
		ignoreErrors: SHARED_IGNORE,
		beforeSend(event: TEvent, hint?: BeforeSendHintLike): TEvent | null {
			const error = hint?.originalException;

			// Aborted in-flight requests — usually a navigation, never a bug.
			if (error instanceof Error && error.message?.includes('cancelled')) {
				return null;
			}

			// Firestore reporting it cannot reach the backend.
			const firebaseError = error as { name?: string; code?: string } | undefined;
			if (firebaseError?.name === 'FirebaseError' && firebaseError?.code === 'unavailable') {
				return null;
			}

			// The Firestore SDK's internal persistence crashes (b815 and friends).
			if (isFirestoreInternalCrash(event, error, { firebaseChunkNames })) {
				return null;
			}

			// workbox-window dereferencing a stubbed serviceWorker.register().
			if (isBlockedServiceWorkerCrash(event, error)) {
				return null;
			}

			// Offline / flaky network / ad-blocked identitytoolkit.
			if (isTransientAuthNetworkError(event, error)) {
				return null;
			}

			// Nothing to report on.
			if (!event.exception && !event.message) {
				return null;
			}

			return event;
		},
	};
}

/**
 * True when a DSN is usable. Keeps the "is this configured" test identical
 * across apps, including the placeholder every .env.example ships with.
 */
export function isUsableDsn(dsn: string | undefined | null): dsn is string {
	return (
		typeof dsn === 'string' &&
		dsn.startsWith('https://') &&
		dsn !== 'YOUR_SENTRY_DSN_HERE'
	);
}
