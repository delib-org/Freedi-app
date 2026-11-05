import { onSnapshot } from 'firebase/firestore';
import type {
	DocumentData,
	DocumentReference,
	DocumentSnapshot,
	FirestoreError,
	Query,
	QuerySnapshot,
	Unsubscribe,
} from 'firebase/firestore';
import { logError } from '@freedi/shared-utils';

/**
 * Self-healing Firestore listeners (same idea as apps/join-class
 * `resilientOnSnapshot`): a listener that dies on a stream error is rebuilt
 * with exponential backoff, and every listener is restarted when the tab
 * wakes up after a long suspension or the network returns.
 */

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** permission-denied does not heal by retrying: stop after a few attempts. */
const PERMISSION_DENIED_MAX_RETRIES = 3;
/** Only resync when the tab was hidden long enough for the platform to have suspended it. */
const MIN_HIDDEN_FOR_RESYNC_MS = 20_000;
/** Coalesce bursts of wake events into a single resync pass. */
const RESYNC_DEBOUNCE_MS = 250;

type Target = Query<DocumentData> | DocumentReference<DocumentData>;

interface Entry {
	name: string;
	target: Target;
	onNext: (snap: DocumentSnapshot<DocumentData> | QuerySnapshot<DocumentData>) => void;
	onError?: (error: FirestoreError) => void;
	inner: Unsubscribe | null;
	retryCount: number;
	retryTimer: ReturnType<typeof setTimeout> | null;
	active: boolean;
}

const registry = new Set<Entry>();

function clearRetry(entry: Entry): void {
	if (entry.retryTimer !== null) {
		clearTimeout(entry.retryTimer);
		entry.retryTimer = null;
	}
}

function handleStreamError(entry: Entry, error: FirestoreError): void {
	entry.inner = null;
	entry.onError?.(error);
	logError(error, {
		operation: 'tables.listeners.streamError',
		metadata: { listener: entry.name, code: error.code, retry: entry.retryCount },
	});

	if (!entry.active) return;
	if (error.code === 'permission-denied' && entry.retryCount >= PERMISSION_DENIED_MAX_RETRIES)
		return;

	const delay = Math.min(RETRY_BASE_MS * 2 ** entry.retryCount, RETRY_MAX_MS);

	entry.retryCount += 1;
	entry.retryTimer = setTimeout(() => {
		entry.retryTimer = null;
		start(entry);
	}, delay);
}

function start(entry: Entry): void {
	if (!entry.active) return;
	entry.inner?.();
	entry.inner = null;
	clearRetry(entry);

	// onSnapshot accepts a document or a query at runtime; the overload split is a typing artifact.
	entry.inner = onSnapshot(
		entry.target as Query<DocumentData>,
		(snap) => {
			entry.retryCount = 0;
			entry.onNext(snap);
		},
		(error) => handleStreamError(entry, error),
	);
}

function resyncAll(): void {
	for (const entry of registry) {
		entry.retryCount = 0;
		start(entry);
	}
}

let resyncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleResync(): void {
	if (resyncTimer !== null) return;
	resyncTimer = setTimeout(() => {
		resyncTimer = null;
		resyncAll();
	}, RESYNC_DEBOUNCE_MS);
}

let hooksInstalled = false;
let hiddenAt: number | null = null;

function installWakeHooks(): void {
	if (hooksInstalled || typeof document === 'undefined') return;
	hooksInstalled = true;

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			hiddenAt = Date.now();

			return;
		}

		const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;

		hiddenAt = null;
		if (hiddenFor >= MIN_HIDDEN_FOR_RESYNC_MS) scheduleResync();
	});
	window.addEventListener('online', scheduleResync);
	window.addEventListener('pageshow', (event: PageTransitionEvent) => {
		if (event.persisted) scheduleResync();
	});
}

function register(
	name: string,
	target: Target,
	onNext: Entry['onNext'],
	onError?: (error: FirestoreError) => void,
): Unsubscribe {
	installWakeHooks();

	const entry: Entry = {
		name,
		target,
		onNext,
		onError,
		inner: null,
		retryCount: 0,
		retryTimer: null,
		active: true,
	};

	registry.add(entry);
	start(entry);

	return () => {
		entry.active = false;
		registry.delete(entry);
		clearRetry(entry);
		entry.inner?.();
		entry.inner = null;
	};
}

export function resilientDoc(
	name: string,
	target: DocumentReference<DocumentData>,
	onNext: (snap: DocumentSnapshot<DocumentData>) => void,
	onError?: (error: FirestoreError) => void,
): Unsubscribe {
	return register(name, target, onNext as Entry['onNext'], onError);
}

export function resilientQuery(
	name: string,
	target: Query<DocumentData>,
	onNext: (snap: QuerySnapshot<DocumentData>) => void,
	onError?: (error: FirestoreError) => void,
): Unsubscribe {
	return register(name, target, onNext as Entry['onNext'], onError);
}
