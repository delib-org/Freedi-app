/**
 * Global error handler for IndexedDB connection errors
 * Prevents app crashes from IndexedDB failures, especially on iOS Safari
 */

export function setupIndexedDBErrorHandler(): void {
	// Listen for unhandled promise rejections that might be IndexedDB-related
	window.addEventListener('unhandledrejection', (event) => {
		const error = event.reason;

		// Check if this is an IndexedDB-related error
		if (isIndexedDBError(error)) {
			console.error('IndexedDB error detected:', error);

			// Prevent the error from crashing the app
			event.preventDefault();

			// Log user-friendly message
			logUserFriendlyError();
		}
	});

	console.info('[IndexedDB Error Handler] Initialized');
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
	];

	// Check for Firestore persistence error codes
	const firestoreErrorCodes = [
		'failed-precondition',
		'unavailable',
		'aborted',
	];

	return (
		indexedDBPatterns.some(pattern =>
			errorMessage.toLowerCase().includes(pattern.toLowerCase())
		) ||
		(errorCode !== undefined && firestoreErrorCodes.includes(errorCode))
	);
}

/**
 * Log a user-friendly error message to the console
 * In the future, this could show a toast notification
 */
function logUserFriendlyError(): void {
	console.info(
		'[App] Running in limited mode. Offline features may be unavailable. ' +
		'This is common on iOS Safari and private browsing mode.'
	);

	// TODO: Add toast notification when UI toast system is available
	// Example: toast.info('App running in limited mode. Offline features temporarily disabled.')
}
