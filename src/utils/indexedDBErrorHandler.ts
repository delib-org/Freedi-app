import { logError } from '@/utils/errorHandling';
/**
 * Global error handler for IndexedDB connection errors
 * Prevents app crashes from IndexedDB failures, especially on iOS Safari
 */

// Key for tracking recovery attempts in sessionStorage
const RECOVERY_ATTEMPT_KEY = 'firestore_recovery_attempt';
const RECOVERY_TIMESTAMP_KEY = 'firestore_recovery_timestamp';
const MAX_RECOVERY_ATTEMPTS = 2;
const RECOVERY_COOLDOWN_MS = 60000; // 1 minute cooldown between recovery attempts

// Key for tracking IndexedDB errors to skip persistence on next load
const INDEXEDDB_ERROR_KEY = 'freedi_indexeddb_error';

export function setupIndexedDBErrorHandler(): void {
	// Listen for unhandled promise rejections that might be IndexedDB-related
	window.addEventListener('unhandledrejection', (event) => {
		const error = event.reason;

		// Check if this is an IndexedDB-related error
		if (isIndexedDBError(error)) {
			logError(error, { operation: 'utils.indexedDBErrorHandler.setupIndexedDBErrorHandler', metadata: { message: 'IndexedDB error detected:' } });

			// Prevent the error from crashing the app
			event.preventDefault();

			// Record Firestore assertion errors for memory cache fallback
			if (isFirestoreAssertionError(error)) {
				recordIndexedDBError();
			}

			// Check if this is a multi-tab persistence error and attempt recovery
			if (isMultiTabPersistenceError(error) || isFirestoreAssertionError(error)) {
				attemptRecovery();
			} else {
				// Log user-friendly message for other IndexedDB errors
				logUserFriendlyError();
			}
		}
	});

	// Also listen for regular errors (Firestore assertion errors come through error events)
	window.addEventListener('error', (event) => {
		const error = event.error;
		if (isFirestoreAssertionError(error)) {
			logError(error, { operation: 'utils.indexedDBErrorHandler.unknown', metadata: { message: 'Firestore assertion error detected:' } });
			event.preventDefault();
			recordIndexedDBError();
			attemptRecovery();
		}
	});

	// Clear recovery counter on successful app load (after 5 seconds)
	setTimeout(() => {
		sessionStorage.removeItem(RECOVERY_ATTEMPT_KEY);
	}, 5000);

	console.info('[IndexedDB Error Handler] Initialized');
}

/**
 * Attempt to recover from persistence errors with protection against infinite loops
 */
function attemptRecovery(): void {
	const attemptCount = parseInt(sessionStorage.getItem(RECOVERY_ATTEMPT_KEY) || '0', 10);
	const lastAttempt = parseInt(sessionStorage.getItem(RECOVERY_TIMESTAMP_KEY) || '0', 10);
	const now = Date.now();

	// Check if we're in cooldown period
	if (now - lastAttempt < RECOVERY_COOLDOWN_MS && attemptCount >= MAX_RECOVERY_ATTEMPTS) {
		logError(new Error('Max recovery attempts reached. Please close other tabs and refresh manually.'), { operation: 'indexedDBErrorHandler.attemptRecovery' });
		logUserFriendlyError();

		return;
	}

	// Reset counter if cooldown has passed
	if (now - lastAttempt >= RECOVERY_COOLDOWN_MS) {
		sessionStorage.setItem(RECOVERY_ATTEMPT_KEY, '1');
	} else {
		sessionStorage.setItem(RECOVERY_ATTEMPT_KEY, String(attemptCount + 1));
	}
	sessionStorage.setItem(RECOVERY_TIMESTAMP_KEY, String(now));

	console.info(`[IndexedDB Recovery] Attempt ${attemptCount + 1}/${MAX_RECOVERY_ATTEMPTS}`);
	handleMultiTabPersistenceError();
}

/**
 * Check if an error is related to IndexedDB
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
		// Firestore internal assertion errors (known bug with persistentMultipleTabManager)
		'INTERNAL ASSERTION FAILED',
		'Unexpected state',
	];

	// Check for Firestore persistence error codes
	const firestoreErrorCodes = ['failed-precondition', 'unavailable', 'aborted'];

	return (
		indexedDBPatterns.some((pattern) =>
			errorMessage.toLowerCase().includes(pattern.toLowerCase()),
		) ||
		(errorCode !== undefined && firestoreErrorCodes.includes(errorCode))
	);
}

/**
 * Check if this is a Firestore internal assertion error
 * These are known bugs in Firebase SDK related to multi-tab persistence
 */
function isFirestoreAssertionError(error: unknown): boolean {
	if (!error) return false;
	const errorMessage = error instanceof Error ? error.message : String(error);

	return errorMessage.includes('INTERNAL ASSERTION FAILED');
}

/**
 * Record IndexedDB error to localStorage to skip persistence on next load
 */
function recordIndexedDBError(): void {
	try {
		const existing = localStorage.getItem(INDEXEDDB_ERROR_KEY);
		const data = existing ? JSON.parse(existing) : { count: 0 };
		data.timestamp = Date.now();
		data.count = (data.count || 0) + 1;
		localStorage.setItem(INDEXEDDB_ERROR_KEY, JSON.stringify(data));
		console.info('[IndexedDB Recovery] Error recorded, will use memory cache on next load');
	} catch {
		// Ignore localStorage errors
	}
}

/**
 * Log a user-friendly error message to the console
 * In the future, this could show a toast notification
 */
function logUserFriendlyError(): void {
	console.info(
		'[App] Running in limited mode. Offline features may be unavailable. ' +
			'This is common on iOS Safari and private browsing mode.',
	);

	// TODO: Add toast notification when UI toast system is available
	// Example: toast.info('App running in limited mode. Offline features temporarily disabled.')
}

/**
 * Check if this is a multi-tab persistence conflict error
 */
function isMultiTabPersistenceError(error: unknown): boolean {
	if (!error) return false;

	const errorMessage = error instanceof Error ? error.message : String(error);

	return errorMessage.includes('exclusive access') || errorMessage.includes('persistence layer');
}

/**
 * Clear Firestore IndexedDB databases to recover from persistence conflicts
 * This is a last-resort recovery mechanism
 */
async function clearFirestoreIndexedDB(): Promise<void> {
	const dbsToDelete = [
		'firestore/[DEFAULT]/freedi-test/main', // Testing env
		'firestore/[DEFAULT]/delib-5/main', // Production env
	];

	for (const dbName of dbsToDelete) {
		try {
			await new Promise<void>((resolve, reject) => {
				const request = indexedDB.deleteDatabase(dbName);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
				request.onblocked = () => {
					console.info(
						`[IndexedDB Recovery] Database ${dbName} is blocked, will retry after reload`,
					);
					resolve();
				};
			});
			console.info(`[IndexedDB Recovery] Cleared database: ${dbName}`);
		} catch {
			// Ignore errors - database might not exist
		}
	}
}

/**
 * Handle multi-tab persistence errors with recovery option
 */
export async function handleMultiTabPersistenceError(): Promise<void> {
	console.info('[IndexedDB Recovery] Attempting to recover from multi-tab persistence conflict...');

	// Try to clear the IndexedDB databases
	await clearFirestoreIndexedDB();

	// Reload the page to reinitialize Firestore
	console.info('[IndexedDB Recovery] Reloading page to reinitialize Firestore...');
	window.location.reload();
}
