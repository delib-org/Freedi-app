/**
 * Global error handler for IndexedDB / Firestore persistence errors.
 *
 * Goal: keep the app alive when the local persistence layer misbehaves
 * (iOS Safari, private browsing, multi-tab conflicts, Firestore SDK internal
 * assertion bugs) WITHOUT triggering a reload storm.
 *
 * History: this handler used to respond to every Firestore
 * "INTERNAL ASSERTION FAILED" by deleting hard-coded IndexedDB databases and
 * calling `window.location.reload()`. The database names were stale (they named
 * `delib-5` / `freedi-test`, never the live `wizcol-app` project), so the delete
 * was a no-op and the reload simply replayed the same failure — producing the
 * "Max recovery attempts reached" errors seen in Sentry. Reloading never fixes
 * the SDK assertion bug, so we no longer reload for it: we record the failure so
 * the next load starts in memory-cache mode, and otherwise degrade quietly.
 */
import { logError } from '@/utils/errorHandling';
import { safeSessionStorage } from '@/utils/safeStorage';
import {
	clearIndexedDBErrorRecord,
	isPersistentCacheEnabled,
	recordIndexedDBError,
} from '@/utils/firestorePersistenceFallback';

// Marks that we already ran a hard recovery in this tab, so we never loop.
const RECOVERY_DONE_KEY = 'firestore_recovery_done';

// How many assertion errors we report to the error tracker per page load.
// The SDK can fire the same assertion dozens of times once it is in a bad
// state; reporting each one buries the signal and inflates Sentry volume.
const MAX_REPORTED_ASSERTIONS = 1;

let reportedAssertions = 0;
let degradedNoticeLogged = false;

export function setupIndexedDBErrorHandler(): void {
	// Unhandled promise rejections that might be IndexedDB-related
	window.addEventListener('unhandledrejection', (event) => {
		if (handlePersistenceError(event.reason)) {
			// Prevent the error from crashing the app
			event.preventDefault();
		}
	});

	// Firestore assertion errors also surface through plain error events
	window.addEventListener('error', (event) => {
		if (handlePersistenceError(event.error)) {
			event.preventDefault();
		}
	});

	console.info('[IndexedDB Error Handler] Initialized');
}

/**
 * Central triage for a candidate persistence error.
 * Returns true when the error was recognised and handled (caller should
 * suppress it), false when it should bubble up normally.
 */
function handlePersistenceError(error: unknown): boolean {
	if (!isIndexedDBError(error)) return false;

	const assertion = isFirestoreAssertionError(error);

	// Report at most once per page load — repeats carry no extra information.
	if (reportedAssertions < MAX_REPORTED_ASSERTIONS) {
		reportedAssertions++;
		logError(error, {
			operation: 'utils.indexedDBErrorHandler.handlePersistenceError',
			metadata: {
				message: 'Firestore persistence error detected',
				isAssertion: assertion,
				persistentCacheEnabled: isPersistentCacheEnabled(),
			},
		});
	}

	if (assertion) {
		// Tell the next page load to start in memory-cache mode. This is the only
		// thing that actually helps: the SDK cannot recover in-place, but a fresh
		// load without the persistent tab manager avoids the bug entirely.
		recordIndexedDBError();
	}

	// A genuine multi-tab exclusive-access conflict IS recoverable by clearing
	// the local database, but only when we were actually using it, and only once
	// per tab — anything more is a reload storm.
	if (isMultiTabPersistenceError(error) && isPersistentCacheEnabled() && !hasRecovered()) {
		markRecovered();
		void recoverFromMultiTabConflict();

		return true;
	}

	logDegradedMode();

	return true;
}

/**
 * Check if an error is related to IndexedDB / Firestore persistence
 */
function isIndexedDBError(error: unknown): boolean {
	if (!error) return false;

	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorCode = (error as { code?: string })?.code;

	// Check for common IndexedDB error patterns
	const indexedDBPatterns = [
		'IndexedDB',
		'IDBDatabase',
		'Connection to Indexed Database server lost',
		'indexed database',
		'Database deleted by request of the user',
		'idb-open',
		'database deleted',
		'database closed',
		'unavailable or restricted',
		// Firestore persistence layer errors (multi-tab conflicts)
		'exclusive access',
		'persistence layer',
		'multi-tab synchronization',
		// Firestore internal assertion errors (known SDK bug, see file header)
		'INTERNAL ASSERTION FAILED',
		'Unexpected state',
	];

	// Check for Firestore persistence error codes
	const firestoreErrorCodes = ['failed-precondition', 'aborted'];

	return (
		indexedDBPatterns.some((pattern) =>
			errorMessage.toLowerCase().includes(pattern.toLowerCase()),
		) ||
		(errorCode !== undefined && firestoreErrorCodes.includes(errorCode))
	);
}

/**
 * Check if this is a Firestore internal assertion error.
 * These are known bugs in the Firebase SDK's persistence/target layer.
 */
function isFirestoreAssertionError(error: unknown): boolean {
	if (!error) return false;
	const errorMessage = error instanceof Error ? error.message : String(error);

	return errorMessage.includes('INTERNAL ASSERTION FAILED');
}

/**
 * Check if this is a multi-tab persistence conflict error
 */
function isMultiTabPersistenceError(error: unknown): boolean {
	if (!error) return false;

	const errorMessage = error instanceof Error ? error.message : String(error);

	return errorMessage.includes('exclusive access') || errorMessage.includes('persistence layer');
}

function hasRecovered(): boolean {
	return safeSessionStorage.getItem(RECOVERY_DONE_KEY) === '1';
}

function markRecovered(): void {
	safeSessionStorage.setItem(RECOVERY_DONE_KEY, '1');
}

/**
 * Log a user-friendly message once per page load.
 */
function logDegradedMode(): void {
	if (degradedNoticeLogged) return;
	degradedNoticeLogged = true;

	console.info(
		'[App] Running in limited mode. Offline features may be unavailable. ' +
			'This is common on iOS Safari and private browsing mode.',
	);
}

/**
 * Delete the Firestore IndexedDB databases for the current project.
 *
 * The database name format is `firestore/{appName}/{projectId}/main`. We derive
 * it from the live config rather than hard-coding project ids, and additionally
 * sweep any `firestore/*` databases the browser reports so stale databases from
 * an earlier project id are cleaned up too.
 */
async function clearFirestoreIndexedDB(): Promise<void> {
	const names = new Set<string>();

	const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
	if (projectId) {
		names.add(`firestore/[DEFAULT]/${projectId}/main`);
	}

	// `indexedDB.databases()` is unavailable in Firefox/Safari — best effort only.
	try {
		const databases = await indexedDB.databases?.();
		databases?.forEach((db) => {
			if (db.name?.startsWith('firestore/')) names.add(db.name);
		});
	} catch {
		// Enumeration not supported — the derived name above is our fallback.
	}

	await Promise.all(
		Array.from(names).map(
			(dbName) =>
				new Promise<void>((resolve) => {
					try {
						const request = indexedDB.deleteDatabase(dbName);
						request.onsuccess = () => {
							console.info(`[IndexedDB Recovery] Cleared database: ${dbName}`);
							resolve();
						};
						request.onerror = () => resolve();
						request.onblocked = () => {
							console.info(`[IndexedDB Recovery] Database ${dbName} is blocked by another tab`);
							resolve();
						};
					} catch {
						resolve();
					}
				}),
		),
	);
}

/**
 * Recover from a multi-tab persistence conflict: clear the local database and
 * reload once so Firestore re-initialises. Only ever called once per tab.
 */
export async function handleMultiTabPersistenceError(): Promise<void> {
	await recoverFromMultiTabConflict();
}

async function recoverFromMultiTabConflict(): Promise<void> {
	console.info('[IndexedDB Recovery] Recovering from multi-tab persistence conflict...');

	// Make sure the next load skips persistence even if the reload is interrupted.
	recordIndexedDBError();
	await clearFirestoreIndexedDB();

	console.info('[IndexedDB Recovery] Reloading page to reinitialize Firestore...');
	window.location.reload();
}

/**
 * Clear the "skip persistence" marker so the app retries IndexedDB on next load.
 * Exposed for support/debugging.
 */
export function resetPersistenceFallback(): void {
	clearIndexedDBErrorRecord();
	safeSessionStorage.removeItem(RECOVERY_DONE_KEY);
}
