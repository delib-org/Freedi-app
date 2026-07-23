/**
 * Self-healing Firestore listeners for the join app.
 *
 * `resilientOnSnapshot` is a drop-in replacement for `onSnapshot` that fixes
 * the "votes took minutes to appear" class of bug at its root:
 *
 *   1. Silent listener death — mobile browsers suspend background tabs and
 *      kill the Firestore Listen stream. The SDK usually reconnects, but on
 *      iOS/Android it can hang half-open for minutes with no error and no
 *      fresh snapshots. Every listener created here is registered in a
 *      module-level registry, and a single set of wake hooks
 *      (visibilitychange → visible after a real suspension, `online`,
 *      bfcache `pageshow`) force-restarts them all. Restart is cheap: the
 *      first snapshot is served from local cache, then the server catches up.
 *
 *   2. Silent listener errors — a plain `onSnapshot(q, onNext)` with no error
 *      callback dies permanently on the first stream error. Here every
 *      listener gets an error handler that logs, then rebuilds with
 *      exponential backoff. `permission-denied` retries are capped (rules
 *      won't change by retrying) but the listener still revives on the next
 *      wake resync.
 *
 * Previously only the facilitator main-statement doc had a wake resync
 * (see `ensureFacilitatorResyncListeners` history in store.ts); the option /
 * evaluation / chat listeners — the ones that carry votes — had nothing.
 */

import {
	onSnapshot,
	DocumentReference,
	DocumentSnapshot,
	Query,
	QuerySnapshot,
	DocumentData,
	FirestoreError,
	Unsubscribe,
} from 'firebase/firestore';

/** Retry ladder: 1s, 2s, 4s, … capped. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** permission-denied won't heal by retrying — stop after a few attempts
 *  (rules propagation after sign-in upgrade is the only transient case). */
const PERMISSION_DENIED_MAX_RETRIES = 3;
/** Only force a resync when the tab was hidden long enough for the platform
 *  to have plausibly suspended the connection. Quick tab-switches on desktop
 *  shouldn't churn 13 listeners. */
const MIN_HIDDEN_FOR_RESYNC_MS = 20_000;
/** Coalesce bursts of wake events (visibility + focus + online often fire
 *  together) into a single resync pass. */
const RESYNC_DEBOUNCE_MS = 250;

type AnyTarget = Query<DocumentData> | DocumentReference<DocumentData>;
type AnyNext = (snap: never) => void;

interface ListenerEntry {
	name: string;
	target: AnyTarget;
	onNext: AnyNext;
	onError?: (err: FirestoreError) => void;
	/** Live unsubscribe for the current inner listener, null while backing off. */
	inner: Unsubscribe | null;
	retryCount: number;
	retryTimer: ReturnType<typeof setTimeout> | null;
	/** True until the caller unsubscribes; guards late timers/snapshots. */
	active: boolean;
}

const registry = new Set<ListenerEntry>();

function startInner(entry: ListenerEntry): void {
	if (!entry.active) return;
	if (entry.inner) {
		entry.inner();
		entry.inner = null;
	}
	if (entry.retryTimer !== null) {
		clearTimeout(entry.retryTimer);
		entry.retryTimer = null;
	}

	// The runtime `onSnapshot` accepts both queries and doc refs; the overload
	// split is purely a TypeScript artifact, so one cast at this seam keeps
	// every call site fully typed.
	entry.inner = onSnapshot(
		entry.target as Query<DocumentData>,
		(snap: QuerySnapshot<DocumentData>) => {
			// A delivered snapshot proves the stream is healthy again.
			entry.retryCount = 0;
			(entry.onNext as (s: QuerySnapshot<DocumentData>) => void)(snap);
		},
		(err: FirestoreError) => {
			handleStreamError(entry, err);
		},
	);
}

function handleStreamError(entry: ListenerEntry, err: FirestoreError): void {
	// The stream is dead after an error — drop the stale unsubscribe.
	entry.inner = null;
	entry.onError?.(err);

	if (!entry.active) return;

	if (err.code === 'permission-denied' && entry.retryCount >= PERMISSION_DENIED_MAX_RETRIES) {
		console.error(
			`[resilientListeners] "${entry.name}" permission-denied after ${entry.retryCount} retries — dormant until next wake resync`,
		);

		return;
	}

	const delay = Math.min(RETRY_BASE_MS * 2 ** entry.retryCount, RETRY_MAX_MS);
	entry.retryCount += 1;
	console.error(
		`[resilientListeners] "${entry.name}" stream error (${err.code}) — retry ${entry.retryCount} in ${delay}ms`,
	);
	entry.retryTimer = setTimeout(() => {
		entry.retryTimer = null;
		startInner(entry);
	}, delay);
}

/**
 * Restart every registered listener on a fresh stream. Exported so callers
 * with bespoke recovery flows (e.g. facilitator follow-me) can piggyback.
 */
export function forceResyncAllListeners(): void {
	for (const entry of registry) {
		entry.retryCount = 0;
		startInner(entry);
	}
}

let resyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleResync(): void {
	if (resyncTimer !== null) return;
	resyncTimer = setTimeout(() => {
		resyncTimer = null;
		forceResyncAllListeners();
	}, RESYNC_DEBOUNCE_MS);
}

let wakeHooksInstalled = false;
let hiddenAt: number | null = null;

function installWakeHooks(): void {
	if (wakeHooksInstalled) return;
	if (typeof document === 'undefined' || typeof window === 'undefined') return;
	wakeHooksInstalled = true;

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			hiddenAt = Date.now();

			return;
		}
		const hiddenFor = hiddenAt !== null ? Date.now() - hiddenAt : 0;
		hiddenAt = null;
		if (hiddenFor >= MIN_HIDDEN_FOR_RESYNC_MS) scheduleResync();
	});

	// Network returned — the old streams are certainly dead.
	window.addEventListener('online', scheduleResync);

	// Restored from the back-forward cache: listeners don't survive bfcache.
	window.addEventListener('pageshow', (e: PageTransitionEvent) => {
		if (e.persisted) scheduleResync();
	});
}

export function resilientOnSnapshot(
	name: string,
	target: DocumentReference<DocumentData>,
	onNext: (snap: DocumentSnapshot<DocumentData>) => void,
	onError?: (err: FirestoreError) => void,
): Unsubscribe;
export function resilientOnSnapshot(
	name: string,
	target: Query<DocumentData>,
	onNext: (snap: QuerySnapshot<DocumentData>) => void,
	onError?: (err: FirestoreError) => void,
): Unsubscribe;
export function resilientOnSnapshot(
	name: string,
	target: AnyTarget,
	onNext:
		| ((snap: DocumentSnapshot<DocumentData>) => void)
		| ((snap: QuerySnapshot<DocumentData>) => void),
	onError?: (err: FirestoreError) => void,
): Unsubscribe {
	installWakeHooks();

	const entry: ListenerEntry = {
		name,
		target,
		onNext: onNext as AnyNext,
		onError,
		inner: null,
		retryCount: 0,
		retryTimer: null,
		active: true,
	};
	registry.add(entry);
	startInner(entry);

	return () => {
		entry.active = false;
		registry.delete(entry);
		if (entry.retryTimer !== null) {
			clearTimeout(entry.retryTimer);
			entry.retryTimer = null;
		}
		if (entry.inner) {
			entry.inner();
			entry.inner = null;
		}
	};
}

/** Test-only: number of live listeners in the registry. */
export function _registrySize(): number {
	return registry.size;
}
