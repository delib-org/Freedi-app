import { afterLoad } from '@/lib/deferWork';

/** Error reporting, kept off the first-paint critical path.
 *
 *  `@sentry/browser` + `@sentry/core` cost ~120 kB raw (~35 kB gzipped) in the
 *  entry chunk, which on a slow connection delayed the question the visitor
 *  actually came to see. The SDK is now imported dynamically once the page has
 *  loaded and the browser is idle.
 *
 *  Deferring the SDK would normally mean losing exactly the errors that matter
 *  most — the ones thrown during boot. So `initSentry()` installs two cheap
 *  native listeners immediately and buffers anything they catch; the buffer is
 *  replayed into Sentry as soon as the real SDK is in place. Nothing is lost,
 *  it just arrives a few seconds later.
 *
 *  `browserTracingIntegration` is deliberately gone. It pulled in
 *  `@sentry-internal/browser-utils` (~24 kB raw on its own) and its pageload
 *  transaction would be meaningless anyway now that init happens after load. */

type SentryClient = typeof import('@/lib/sentryClient');
type SentryOptions = import('@/lib/sentryClient').BrowserOptions;

let sdk: SentryClient | null = null;
/** True from the moment `Sentry.init()` returns. The pre-init listeners check
 *  this so an error thrown in the window between init and listener removal is
 *  reported once by Sentry's own global handlers, not twice. */
let initialized = false;

interface BufferedError {
	error: unknown;
	context?: Record<string, unknown>;
}

/** Bounded so a boot-time error loop can't grow this without limit. */
const MAX_BUFFERED = 10;
const buffered: BufferedError[] = [];
let pendingUid: string | null = null;
let hasPendingUid = false;

function resolveDsn(): string | null {
	const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

	if (
		!import.meta.env.PROD ||
		!dsn ||
		dsn === 'YOUR_SENTRY_DSN_HERE' ||
		!dsn.startsWith('https://')
	) {
		return null;
	}

	return dsn;
}

function buffer(error: unknown, context?: Record<string, unknown>): void {
	if (buffered.length >= MAX_BUFFERED) return;
	buffered.push({ error, context });
}

function onEarlyError(event: ErrorEvent): void {
	if (initialized) return;
	buffer(event.error ?? event.message, { source: 'pre-init window.onerror' });
}

function onEarlyRejection(event: PromiseRejectionEvent): void {
	if (initialized) return;
	buffer(event.reason, { source: 'pre-init unhandledrejection' });
}

/** The Sentry options object. Extracted so the dynamic-import path stays
 *  readable; it's plain data and adds ~1 kB to the entry chunk. */
function sentryOptions(dsn: string): SentryOptions {
	return {
		dsn,
		environment: (import.meta.env.VITE_ENVIRONMENT as string) || 'production',
		release: (import.meta.env.VITE_APP_VERSION as string) || '1.0.0',
		initialScope: {
			tags: { app: 'join' },
		},
		beforeSend(event, hint) {
			const error = hint.originalException;

			if (error instanceof Error && error.message?.includes('cancelled')) {
				return null;
			}

			const firebaseErr = error as { name?: string; code?: string } | undefined;
			if (firebaseErr?.name === 'FirebaseError' && firebaseErr?.code === 'unavailable') {
				return null;
			}

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

			if (!event.exception && !event.message) {
				return null;
			}

			return event;
		},
		ignoreErrors: [
			'top.GLOBALS',
			'ResizeObserver loop limit exceeded',
			'Non-Error promise rejection captured',
			'Network request failed',
			'NetworkError',
			'Failed to fetch',
			'permission-denied',
			'Failed to get document because the client is offline',
			'Could not reach Cloud Firestore backend',
			'IndexedDbTransactionError',
			'IndexedDB transaction',
			'Internal error opening backing store for indexedDB.open',
			'QuotaExceededError',
			/UnknownError.*indexedDB/i,
			/backing store/i,
			// Service worker registration rejections — crawlers, private
			// mode, sandboxed browsers; nothing we can do client-side.
			/serviceWorker\.register/i,
			/Failed to register a ServiceWorker/i,
		],
	};
}

async function loadAndInit(dsn: string): Promise<void> {
	try {
		const Sentry = await import('@/lib/sentryClient');

		Sentry.initClient(sentryOptions(dsn));
		sdk = Sentry;
		initialized = true;

		window.removeEventListener('error', onEarlyError);
		window.removeEventListener('unhandledrejection', onEarlyRejection);

		if (hasPendingUid) {
			Sentry.setUser(pendingUid ? { id: pendingUid } : null);
			hasPendingUid = false;
		}

		const replay = buffered.splice(0, buffered.length);
		for (const item of replay) {
			captureException(item.error, item.context);
		}
	} catch {
		// The SDK chunk failed to load (offline, blocked by an extension, CDN
		// hiccup). Reporting errors is best-effort — drop the buffer and leave
		// the app running rather than surfacing a monitoring failure to users.
		buffered.length = 0;
	}
}

export function initSentry(): void {
	const dsn = resolveDsn();
	if (!dsn) return;

	window.addEventListener('error', onEarlyError);
	window.addEventListener('unhandledrejection', onEarlyRejection);

	afterLoad(() => {
		void loadAndInit(dsn);
	});
}

export function setSentryUser(uid: string | null): void {
	if (!resolveDsn()) return;

	if (!sdk) {
		pendingUid = uid;
		hasPendingUid = true;

		return;
	}

	sdk.setUser(uid ? { id: uid } : null);
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
	if (!resolveDsn()) return;

	if (!sdk) {
		buffer(error, context);

		return;
	}

	sdk.withScope((scope) => {
		if (context) {
			scope.setContext('additional', context);
		}
		sdk?.captureException(error);
	});
}
