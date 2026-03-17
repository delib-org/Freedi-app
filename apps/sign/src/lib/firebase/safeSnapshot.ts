/**
 * Safe Firestore onSnapshot wrappers
 *
 * Prevents the "INTERNAL ASSERTION FAILED: Unexpected state" error
 * that occurs when Firestore listeners are rapidly created/destroyed.
 *
 * Two issues are addressed:
 * 1. Callbacks firing after unsubscribe (guarded by `active` flag)
 * 2. Watch stream race condition (mitigated by delayed unsubscribe)
 */

import {
	onSnapshot,
	Query,
	DocumentReference,
	QuerySnapshot,
	DocumentSnapshot,
	FirestoreError,
	DocumentData,
} from 'firebase/firestore';

/** Delay before actual Firestore unsubscribe, allowing pending watch events to drain */
const UNSUBSCRIBE_DELAY_MS = 50;

/**
 * Check if an error is a non-fatal Firestore internal assertion.
 * These occur during rapid listener lifecycle changes and are SDK bugs,
 * not application errors.
 */
function isFirestoreInternalError(error: unknown): boolean {
	return error instanceof Error && error.message.includes('INTERNAL ASSERTION FAILED');
}

/**
 * Safe wrapper around onSnapshot for Firestore queries.
 * Filters internal assertion errors and delays unsubscribe to prevent race conditions.
 */
export function safeQuerySnapshot<T extends DocumentData>(
	q: Query<T>,
	onNext: (snapshot: QuerySnapshot<T>) => void,
	onError?: (error: FirestoreError) => void
): () => void {
	let active = true;

	const unsubscribe = onSnapshot(
		q,
		(snapshot) => {
			if (active) onNext(snapshot);
		},
		(error) => {
			if (!active || isFirestoreInternalError(error)) return;
			if (onError) onError(error);
		}
	);

	return () => {
		active = false;
		setTimeout(unsubscribe, UNSUBSCRIBE_DELAY_MS);
	};
}

/**
 * Safe wrapper around onSnapshot for Firestore document references.
 * Filters internal assertion errors and delays unsubscribe to prevent race conditions.
 */
export function safeDocSnapshot<T extends DocumentData>(
	ref: DocumentReference<T>,
	onNext: (snapshot: DocumentSnapshot<T>) => void,
	onError?: (error: FirestoreError) => void
): () => void {
	let active = true;

	const unsubscribe = onSnapshot(
		ref,
		(snapshot) => {
			if (active) onNext(snapshot);
		},
		(error) => {
			if (!active || isFirestoreInternalError(error)) return;
			if (onError) onError(error);
		}
	);

	return () => {
		active = false;
		setTimeout(unsubscribe, UNSUBSCRIBE_DELAY_MS);
	};
}

/**
 * Install global error handlers to suppress unhandled Firestore internal assertions.
 * Call once during app initialization. Returns cleanup function.
 */
export function installFirestoreErrorFilter(): () => void {
	if (typeof window === 'undefined') return () => {};

	const errorHandler = (event: ErrorEvent) => {
		if (isFirestoreInternalError(event.error)) {
			event.preventDefault();
		}
	};

	const rejectionHandler = (event: PromiseRejectionEvent) => {
		if (isFirestoreInternalError(event.reason)) {
			event.preventDefault();
		}
	};

	window.addEventListener('error', errorHandler);
	window.addEventListener('unhandledrejection', rejectionHandler);

	return () => {
		window.removeEventListener('error', errorHandler);
		window.removeEventListener('unhandledrejection', rejectionHandler);
	};
}
