/**
 * Shared state for the Firestore local-persistence fallback.
 *
 * Lives in its own module (rather than in `controllers/db/config`) so that the
 * global error handler can record failures without importing — and therefore
 * eagerly initialising — the Firebase app.
 */
import { safeLocalStorage, safeSessionStorage } from '@/utils/safeStorage';
import { logError } from '@/utils/errorHandling';

const INDEXEDDB_ERROR_KEY = 'freedi_indexeddb_error';

// Reset the marker after this long so a one-off failure does not permanently
// disable offline support on a healthy browser.
const FALLBACK_TTL_HOURS = 24;

interface FallbackRecord {
	count: number;
	timestamp: number;
}

// Whether the Firestore instance for this page load actually uses the
// persistent (IndexedDB-backed) cache. Set once during initialisation.
let persistentCacheEnabled = false;

export function setPersistentCacheEnabled(enabled: boolean): void {
	persistentCacheEnabled = enabled;
}

export function isPersistentCacheEnabled(): boolean {
	return persistentCacheEnabled;
}

function readRecord(): FallbackRecord | null {
	const raw = safeLocalStorage.getItem(INDEXEDDB_ERROR_KEY);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<FallbackRecord>;

		return {
			count: typeof parsed.count === 'number' ? parsed.count : 0,
			timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : 0,
		};
	} catch {
		return null;
	}
}

/**
 * Record a persistence failure so the next page load starts in memory-cache mode.
 *
 * Also mirrors the flag into sessionStorage: when localStorage is unavailable
 * (private browsing) the memory fallback in safeStorage is per-page-load, so the
 * session copy is what survives a reload in the same tab.
 */
export function recordIndexedDBError(): void {
	const existing = readRecord();
	const record: FallbackRecord = {
		count: (existing?.count ?? 0) + 1,
		timestamp: Date.now(),
	};

	safeLocalStorage.setItem(INDEXEDDB_ERROR_KEY, JSON.stringify(record));
	safeSessionStorage.setItem(INDEXEDDB_ERROR_KEY, '1');
	console.info('[IndexedDB Recovery] Error recorded, will use memory cache on next load');
}

/**
 * Should this page load skip IndexedDB persistence?
 *
 * A single failure is enough: the Firestore internal-assertion bug is not
 * self-healing, and a second attempt just reproduces the crash for the user.
 */
export function shouldSkipIndexedDB(): boolean {
	if (safeSessionStorage.getItem(INDEXEDDB_ERROR_KEY) === '1') return true;

	const record = readRecord();
	if (!record) return false;

	const hoursSinceError = (Date.now() - record.timestamp) / (1000 * 60 * 60);
	if (hoursSinceError > FALLBACK_TTL_HOURS) {
		clearIndexedDBErrorRecord();

		return false;
	}

	return record.count >= 1;
}

/**
 * Is this the Firestore SDK's "INTERNAL ASSERTION FAILED" error?
 *
 * Once the SDK hits one, its async queue is permanently failed for this page
 * load: every later call - including a listener's unsubscribe - throws the same
 * error synchronously.
 */
export function isFirestoreAssertionError(error: unknown): boolean {
	if (!error) return false;
	const errorMessage = error instanceof Error ? error.message : String(error);

	return errorMessage.includes('INTERNAL ASSERTION FAILED');
}

let reportedUnsubscribeAssertion = false;

/**
 * Wrap a Firestore unsubscribe so it never throws.
 *
 * Unsubscribes run in React effect cleanups. When the SDK queue has failed,
 * the throw escapes the cleanup and the nearest error boundary replaces the
 * whole screen. The listener is dead either way, so swallowing is safe; we
 * record the failure so the next load starts in memory-cache mode.
 */
export function guardUnsubscribe(unsubscribe: () => void, operation: string): () => void {
	return () => {
		try {
			unsubscribe();
		} catch (error) {
			const assertion = isFirestoreAssertionError(error);
			if (assertion) recordIndexedDBError();

			// The failed queue repeats the same assertion for every listener.
			if (assertion && reportedUnsubscribeAssertion) return;
			if (assertion) reportedUnsubscribeAssertion = true;

			logError(error, { operation, metadata: { phase: 'unsubscribe', isAssertion: assertion } });
		}
	};
}

export function clearIndexedDBErrorRecord(): void {
	safeLocalStorage.removeItem(INDEXEDDB_ERROR_KEY);
	safeSessionStorage.removeItem(INDEXEDDB_ERROR_KEY);
}
