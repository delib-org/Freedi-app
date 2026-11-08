import { buildSentryOptions, isLocalRuntime, isUsableDsn } from '@freedi/shared-utils';
import { afterLoad } from '@/lib/deferWork';

/** The `app` tag every Tables event carries (filter app:tables in Sentry). */
const SENTRY_APP_TAG = 'tables';

/** Substring identifying this app's Firebase bundle (manualChunks in vite.config.ts). */
const FIREBASE_CHUNK_NAMES = ['firebase-sdk'] as const;

function resolveDsn(): string | null {
	const dsn = import.meta.env.VITE_SENTRY_DSN;

	// A local run never reports, however the bundle was built.
	if (
		isLocalRuntime(import.meta.env.VITE_SENTRY_ENABLE_IN_LOCAL === 'true') ||
		!import.meta.env.PROD ||
		!isUsableDsn(dsn)
	) {
		return null;
	}

	return dsn;
}

async function loadAndInit(dsn: string): Promise<void> {
	try {
		const Sentry = await import('@sentry/browser');
		Sentry.init(
			buildSentryOptions({
				dsn,
				app: SENTRY_APP_TAG,
				environment: import.meta.env.VITE_ENVIRONMENT || 'production',
				release: import.meta.env.VITE_APP_VERSION || '1.0.0',
				firebaseChunkNames: FIREBASE_CHUNK_NAMES,
			}),
		);
	} catch {
		// Reporting is best-effort: a blocked or offline SDK chunk must not break the app.
	}
}

/** Start error reporting once the page is idle. Does nothing without a usable DSN. */
export function initSentry(): void {
	const dsn = resolveDsn();

	if (!dsn) return;

	afterLoad(() => {
		void loadAndInit(dsn);
	});
}
