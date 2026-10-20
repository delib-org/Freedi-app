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
 * It is also a no-op on a developer's machine, DSN or not. functions/.env
 * carries a real DSN so that `npm run deploy:f:*` has one, and the emulator
 * loads that same file — so a wedged local Firestore or a half-finished branch
 * filed `environment: development` issues into the production project and spent
 * its quota. Set SENTRY_ENABLE_IN_LOCAL=true to report from a local run on
 * purpose, e.g. when testing this wiring itself.
 *
 * Mirrors `isLocalRuntime` in @freedi/shared-utils, which every app uses.
 * Duplicated rather than imported because functions/ installs shared packages
 * as packed tarballs, and a monitoring guard should not depend on a repack.
 */

import * as Sentry from '@sentry/node';

let initialized = false;

/** Emulator variables — any one of them means a Firebase emulator is in play. */
const EMULATOR_ENV_VARS = [
	'FUNCTIONS_EMULATOR',
	'FIRESTORE_EMULATOR_HOST',
	'FIREBASE_AUTH_EMULATOR_HOST',
	'FIREBASE_DATABASE_EMULATOR_HOST',
	'FIREBASE_STORAGE_EMULATOR_HOST',
	'FIREBASE_EMULATOR_HUB',
	'PUBSUB_EMULATOR_HOST',
];

/**
 * True on a developer's machine. Cloud Run — which is what Cloud Functions v2
 * runs on — always sets K_SERVICE, and the functions framework always sets
 * FUNCTION_TARGET, so their absence means nobody deployed this.
 */
function isLocalRuntime(): boolean {
	if (process.env.SENTRY_ENABLE_IN_LOCAL === 'true') return false;
	if (EMULATOR_ENV_VARS.some((name) => Boolean(process.env[name]))) return true;
	if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return true;

	return !(process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTION_NAME);
}

/** True when a DSN is present and usable. */
function resolveDsn(): string | null {
	if (isLocalRuntime()) return null;

	const dsn = process.env.SENTRY_DSN_FUNCTIONS || process.env.SENTRY_DSN;

	if (!dsn || !dsn.startsWith('https://') || dsn === 'YOUR_SENTRY_DSN_HERE') {
		return null;
	}

	return dsn;
}

/**
 * HttpsError codes that describe the caller's request, not a fault in the
 * function. The Firebase integration captures every error an onCall handler
 * throws, so without this filter a curl probe with no token, or a client that
 * sent an invalid payload, files a "handled: no" issue in Sentry at error level.
 * Those are the function working as designed. Anything else — `internal`,
 * `unavailable`, `unknown`, and plain Errors — still goes through.
 */
const CLIENT_FAULT_CODES: ReadonlySet<string> = new Set([
	'unauthenticated',
	'permission-denied',
	'invalid-argument',
	'not-found',
	'already-exists',
	'failed-precondition',
	'resource-exhausted',
	'out-of-range',
	'cancelled',
	'aborted',
]);

/** HTTP status range an HttpsError with a client-fault code must agree with. */
const MIN_CLIENT_FAULT_HTTP_STATUS = 400;
const MAX_CLIENT_FAULT_HTTP_STATUS = 499;

interface ErrorLike {
	name?: unknown;
	code?: unknown;
	constructor?: { name?: unknown };
	httpErrorCode?: { status?: unknown; canonicalName?: unknown };
}

type FaultClass = 'client' | 'server' | 'unknown';

function normalizeCode(code: unknown): string | null {
	if (typeof code !== 'string') return null;

	return code
		.replace(/^functions\//, '')
		.toLowerCase()
		.replace(/_/g, '-');
}

/**
 * Only an HttpsError is trusted to carry a Firebase code. A third-party SDK
 * error with `code: 'RESOURCE_EXHAUSTED'` or a plain object with `.status: 429`
 * is OUR failure talking to an upstream, so it must still be reported.
 */
function isIdentifiedHttpsError(error: ErrorLike): boolean {
	return (
		(typeof error.httpErrorCode === 'object' && error.httpErrorCode !== null) ||
		error.name === 'HttpsError' ||
		error.constructor?.name === 'HttpsError'
	);
}

/**
 * Classify the hint's exception. Server wins on any doubt: an unreadable code,
 * or a client-fault code whose HTTP status says 5xx, is never dropped.
 */
function classifyException(error: unknown): FaultClass {
	if (typeof error !== 'object' || error === null) return 'unknown';
	const candidate = error as ErrorLike;
	if (!isIdentifiedHttpsError(candidate)) return 'unknown';

	const code =
		normalizeCode(candidate.code) ?? normalizeCode(candidate.httpErrorCode?.canonicalName);
	if (code === null) return 'unknown';
	if (!CLIENT_FAULT_CODES.has(code)) return 'server';

	const status = candidate.httpErrorCode?.status;
	if (
		typeof status === 'number' &&
		(status < MIN_CLIENT_FAULT_HTTP_STATUS || status > MAX_CLIENT_FAULT_HTTP_STATUS)
	) {
		return 'server';
	}

	return 'client';
}

interface SentryExceptionValue {
	type?: string;
	mechanism?: { data?: Record<string, unknown> };
}

interface EventLike {
	exception?: { values?: SentryExceptionValue[] };
	extra?: Record<string, unknown>;
	contexts?: Record<string, Record<string, unknown> | undefined>;
}

function isClientFaultCode(code: unknown): boolean {
	const normalized = normalizeCode(code);

	return normalized !== null && CLIENT_FAULT_CODES.has(normalized);
}

/**
 * Fallback for when there is no `hint.originalException` at all. Only an
 * exception entry typed HttpsError, with a readable client-fault code, is
 * dropped; anything else is kept so real faults are never hidden.
 */
function eventDescribesClientFault(event: EventLike): boolean {
	const values = event.exception?.values ?? [];

	return values.some((entry) => {
		if (entry.type !== 'HttpsError') return false;

		return (
			isClientFaultCode(entry.mechanism?.data?.code) ||
			isClientFaultCode(event.extra?.code) ||
			isClientFaultCode(event.contexts?.error?.code) ||
			isClientFaultCode(event.contexts?.HttpsError?.code)
		);
	});
}

/**
 * `beforeSend` hook: drop events whose original exception is a client-fault
 * HttpsError. A readable hint always decides; the event-only fallback runs
 * solely when the hint carries no exception. Exported so the filter is
 * testable without initializing Sentry.
 */
export function filterClientFaultEvents<E>(
	event: E,
	hint: { originalException?: unknown } | undefined,
): E | null {
	const original = hint?.originalException;

	if (original !== undefined && original !== null) {
		return classifyException(original) === 'client' ? null : event;
	}

	if (event && typeof event === 'object' && eventDescribesClientFault(event as EventLike)) {
		return null;
	}

	return event;
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
		beforeSend: filterClientFaultEvents,
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
