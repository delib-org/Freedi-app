import * as Sentry from '@sentry/browser';

let initialized = false;

export function initSentry(): void {
	const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

	if (
		!import.meta.env.PROD ||
		!dsn ||
		dsn === 'YOUR_SENTRY_DSN_HERE' ||
		!dsn.startsWith('https://')
	) {
		return;
	}

	Sentry.init({
		dsn,
		environment: (import.meta.env.VITE_ENVIRONMENT as string) || 'production',
		release: (import.meta.env.VITE_APP_VERSION as string) || '1.0.0',
		integrations: [Sentry.browserTracingIntegration()],
		tracesSampleRate: 0.1,
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
		],
	});

	initialized = true;
}

export function setSentryUser(uid: string | null): void {
	if (!initialized) return;
	Sentry.setUser(uid ? { id: uid } : null);
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
	if (!initialized) return;
	Sentry.withScope((scope) => {
		if (context) {
			scope.setContext('additional', context);
		}
		Sentry.captureException(error);
	});
}
