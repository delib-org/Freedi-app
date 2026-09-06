/**
 * Sentry for Cloud Functions.
 *
 * Until now the only Sentry package in functions/ was @sentry/sveltekit, wired
 * up for the chat SSR handler. Every callable, trigger and scheduled function
 * reported nothing: errors went to Cloud Logging as structured JSON and stayed
 * there, so a broken function was only ever found by someone going to look.
 *
 * Initialization is a no-op without a DSN, which keeps the test suite and any
 * environment that has not been given one completely unaffected.
 *
 * It is also a no-op inside the emulator, DSN or not. functions/.env carries a
 * real DSN so that `npm run deploy:f:*` has one, and the emulator loads that
 * same file — so a wedged local Firestore or a half-finished branch filed
 * `environment: development` issues into the production project and spent its
 * quota. Set SENTRY_ENABLE_IN_EMULATOR=true to report from a local run on
 * purpose, e.g. when testing this wiring itself.
 */

import * as Sentry from '@sentry/node';

let initialized = false;

/** True when a DSN is present and usable. */
function resolveDsn(): string | null {
	const inEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
	if (inEmulator && process.env.SENTRY_ENABLE_IN_EMULATOR !== 'true') {
		return null;
	}

	const dsn = process.env.SENTRY_DSN_FUNCTIONS || process.env.SENTRY_DSN;

	if (!dsn || !dsn.startsWith('https://') || dsn === 'YOUR_SENTRY_DSN_HERE') {
		return null;
	}

	return dsn;
}

/**
 * Initialize Sentry once per instance. Safe to call more than once.
 *
 * Called at module load in index.ts so that a crash during cold start — which
 * is exactly the kind that never reaches a handler's try/catch — is still
 * reported.
 */
export function initFunctionsSentry(): void {
	if (initialized) return;

	const dsn = resolveDsn();
	if (!dsn) return;

	Sentry.init({
		dsn,
		environment: process.env.ENVIRONMENT || 'production',
		initialScope: { tags: { app: 'functions' } },
		// No tracing: these are background triggers and callables, and the
		// per-invocation overhead is not worth it until someone asks for it.
		tracesSampleRate: 0,
		ignoreErrors: [
			// A client that went away mid-request.
			'ECONNRESET',
			'EPIPE',
			'Client network socket disconnected',
		],
	});

	initialized = true;
}

/** True when Sentry is actually reporting. */
export function isSentryEnabled(): boolean {
	return initialized;
}

/**
 * Report an error to Sentry with the same structured context the Cloud Logging
 * entry carries. Called from logError, so no handler needs to know about it.
 */
export function captureFunctionError(
	error: Error,
	context: {
		operation: string;
		userId?: string;
		statementId?: string;
		metadata?: Record<string, unknown>;
	},
): void {
	if (!initialized) return;

	Sentry.captureException(error, {
		tags: { operation: context.operation },
		user: context.userId ? { id: context.userId } : undefined,
		extra: {
			statementId: context.statementId,
			...context.metadata,
		},
	});
}

/**
 * Flush queued events.
 *
 * Cloud Functions v2 runs on Cloud Run, so an instance normally stays warm long
 * enough for the background transport to drain on its own. A handler doing
 * something unusually terminal — the last thing before a deliberate crash, or a
 * long scheduled job — can await this to be certain nothing is dropped.
 */
export async function flushSentry(timeoutMs = 2000): Promise<boolean> {
	if (!initialized) return true;

	try {
		return await Sentry.flush(timeoutMs);
	} catch {
		return false;
	}
}
