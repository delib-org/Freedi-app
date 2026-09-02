/**
 * Shared Sentry `beforeSend` filters.
 *
 * These drop crashes that come from inside a third-party bundle and cannot be
 * fixed from application code. They live here rather than in any one app
 * because the main app, join and sign all ship the same Firebase SDK and hit
 * the same SDK bugs — and because the frame-matching is subtle enough that
 * three hand-written copies drifted apart the first time it was tried.
 *
 * Deliberately SDK-agnostic: shared-utils does not depend on any Sentry
 * package, so the event is described by the minimal structural types below and
 * every app passes its own `Sentry.ErrorEvent` straight in.
 */

export interface SentryLikeFrame {
	filename?: string;
}

export interface SentryLikeStacktrace {
	frames?: SentryLikeFrame[];
}

export interface SentryLikeException {
	type?: string;
	value?: string;
	stacktrace?: SentryLikeStacktrace;
}

export interface SentryLikeEvent {
	exception?: { values?: SentryLikeException[] };
	message?: string;
}

/**
 * Null-dereference messages the Firestore SDK throws from its own persistence /
 * target layer (`removeTarget`, LRU garbage collection).
 */
const FIRESTORE_INTERNAL_MESSAGES = [
	'INTERNAL ASSERTION FAILED',
	"Cannot read properties of null (reading 'target')",
	"Cannot read properties of null (reading 'withSequenceNumber')",
];

/**
 * The SDK's own assertion prefix. Nothing in application code produces this
 * string, so it identifies the crash on its own — no stack needed.
 */
const FIRESTORE_ASSERTION_PREFIX = 'INTERNAL ASSERTION FAILED';

function messageOf(exception: SentryLikeException): string {
	return `${exception.type ?? ''}: ${exception.value ?? ''}`;
}

function hasFirestoreMessage(message: string): boolean {
	return FIRESTORE_INTERNAL_MESSAGES.some((known) => message.includes(known));
}

function isInChunk(frame: SentryLikeFrame, chunkNames: readonly string[]): boolean {
	const filename = frame.filename ?? '';

	return chunkNames.some((chunk) => filename.includes(chunk));
}

export interface FirestoreCrashOptions {
	/**
	 * Substrings identifying the app's Firebase vendor bundle, e.g.
	 * `['vendor-firebase']` for the main app or `['firebase-']` for join.
	 *
	 * Omit for bundlers that give the SDK no distinguishable filename (Next.js
	 * hashed chunks). Then only the unmistakable assertion message is matched,
	 * and the null-dereference variants are reported like any other error —
	 * which is the honest outcome, since without frames there is no way to tell
	 * an SDK crash from an app-code one with a similar message.
	 */
	firebaseChunkNames?: readonly string[];
}

/**
 * True when the event is one of the Firestore SDK's internal persistence
 * crashes (the well-known "INTERNAL ASSERTION FAILED (ID: b815)" family).
 *
 * Each exception value is judged on its OWN frames. That is the whole point:
 * these arrive as a *chained* exception — an outer FirebaseError wrapping the
 * inner TypeError — so the outer value carries application frames while the
 * inner one is entirely inside the vendor bundle. Flattening every value's
 * frames into one array and asking whether they are *all* vendor frames, as
 * this check first did, answers "no" for exactly the events it exists to drop.
 */
export function isFirestoreInternalCrash(
	event: SentryLikeEvent,
	error: unknown,
	options: FirestoreCrashOptions = {},
): boolean {
	const chunkNames = options.firebaseChunkNames ?? [];
	const values = event.exception?.values ?? [];

	for (const exception of values) {
		const message = messageOf(exception);
		if (!hasFirestoreMessage(message)) continue;

		// The assertion prefix is the SDK's own and needs no corroboration.
		if (message.includes(FIRESTORE_ASSERTION_PREFIX)) return true;

		// A null-dereference message is only conclusive when this value's own
		// frames are all inside the Firebase bundle; app code can produce a
		// similar message and must still be reported.
		const frames = exception.stacktrace?.frames ?? [];
		if (chunkNames.length === 0 || frames.length === 0) continue;
		if (frames.every((frame) => isInChunk(frame, chunkNames))) return true;
	}

	// Fall back to the thrown value, for events whose exception list is empty.
	const directMessage = error instanceof Error ? error.message : undefined;
	if (directMessage && hasFirestoreMessage(directMessage)) {
		if (directMessage.includes(FIRESTORE_ASSERTION_PREFIX)) return true;
		if (values.length === 0) return true;
	}

	return false;
}

const WORKBOX_NULL_DEREF =
	/Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '(?:waiting|installing|active)'\)|(?:undefined|null) is not an object \(evaluating '.*\.(?:waiting|installing|active)'\)/;

/**
 * True when the event is workbox-window dereferencing a registration that
 * `serviceWorker.register()` never returned. Privacy extensions and automation
 * harnesses stub register() so it resolves undefined; the crash happens inside
 * the minified workbox bundle, so app code cannot guard it.
 *
 * Requires the stack to be rooted in workbox-window, so an app-code
 * dereference with a similar message is still reported.
 */
export function isBlockedServiceWorkerCrash(event: SentryLikeEvent, error: unknown): boolean {
	const values = event.exception?.values ?? [];

	for (const exception of values) {
		if (!WORKBOX_NULL_DEREF.test(messageOf(exception))) continue;

		const frames = exception.stacktrace?.frames ?? [];
		if (frames.length === 0) continue;
		if (frames.every((frame) => isInChunk(frame, ['workbox-window']))) return true;
	}

	const directMessage = error instanceof Error ? error.message : undefined;
	if (directMessage && WORKBOX_NULL_DEREF.test(directMessage) && values.length === 0) {
		// No frames at all to corroborate with — the old behaviour was to keep
		// these, and there is no way to tell them apart, so keep them.
		return false;
	}

	return false;
}

/** Firebase Auth error codes that mean "the network was unavailable". */
const TRANSIENT_AUTH_CODES = ['auth/network-request-failed', 'auth/timeout'];

/**
 * True when the event is a transient connectivity failure talking to Firebase
 * Auth — offline, flaky mobile network, or an ad-blocker blocking
 * identitytoolkit.googleapis.com. Nothing is broken and nothing is fixable, so
 * these should not compete with real errors in the issue list.
 */
export function isTransientAuthNetworkError(event: SentryLikeEvent, error: unknown): boolean {
	const code = (error as { code?: string } | undefined)?.code;
	if (typeof code === 'string' && TRANSIENT_AUTH_CODES.includes(code)) return true;

	const values = event.exception?.values ?? [];

	return values.some((exception) => {
		const message = messageOf(exception);

		return TRANSIENT_AUTH_CODES.some((known) => message.includes(known));
	});
}
