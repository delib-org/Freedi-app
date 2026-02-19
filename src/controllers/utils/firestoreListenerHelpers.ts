import {
	DocumentReference,
	CollectionReference,
	Query,
	onSnapshot,
	DocumentSnapshot,
	QuerySnapshot,
	FirestoreError,
} from 'firebase/firestore';
import { listenerManager } from './ListenerManager';
import { Unsubscribe } from 'firebase/auth';
import { logError } from '@/utils/errorHandling';

/**
 * Creates a managed document listener that tracks document fetches
 * @param docRef Document reference to listen to
 * @param key Unique key for this listener
 * @param onNext Callback for document updates
 * @param onError Optional error callback
 * @returns Unsubscribe function
 */
export function createManagedDocumentListener(
	docRef: DocumentReference,
	key: string,
	onNext: (snapshot: DocumentSnapshot) => void,
	onError?: (error: FirestoreError) => void,
): Unsubscribe {
	// SYNCHRONOUS check - prevents race conditions
	const shouldSetup = listenerManager.registerListenerIntent(key);

	if (!shouldSetup) {
		// Listener already exists or is being set up
		// Return unsubscribe that just decrements ref count
		return () => {
			listenerManager.removeListener(key);
		};
	}

	// Setup function that will be called by ListenerManager
	const setupFn = (onDocumentCount?: (count: number) => void) => {
		let isFirstCall = true;

		return onSnapshot(
			docRef,
			(snapshot) => {
				// Track document count (1 for single document)
				// Skip counting on first call to avoid inflated counts on listener recreation
				if (onDocumentCount && !isFirstCall) {
					onDocumentCount(snapshot.exists() ? 1 : 0);
				}
				if (isFirstCall) {
					isFirstCall = false;
				}
				onNext(snapshot);
			},
			onError,
		);
	};

	// Add listener to manager (we already registered intent synchronously)
	listenerManager.addListener(key, setupFn, { type: 'document' }).catch((error) => {
		logError(error, { operation: 'controllerUtils.firestoreListenerHelpers.setupFn', metadata: { message: 'Failed to add listener ${key}:' } });
		// Clean up pending state if setup fails
		listenerManager.removeListener(key);
	});

	// Always return unsubscribe function that removes from manager
	// The manager will handle ref counting and only unsubscribe when count reaches 0
	return () => {
		listenerManager.removeListener(key);
	};
}

/**
 * Creates a managed collection/query listener that tracks document fetches
 * @param queryRef Collection or query reference to listen to
 * @param key Unique key for this listener
 * @param onNext Callback for query updates
 * @param onError Optional error callback
 * @returns Unsubscribe function
 */
export function createManagedCollectionListener(
	queryRef: CollectionReference | Query,
	key: string,
	onNext: (snapshot: QuerySnapshot) => void,
	onError?: (error: FirestoreError) => void,
	type: 'collection' | 'query' = 'query',
): Unsubscribe {
	// SYNCHRONOUS check - prevents race conditions
	const shouldSetup = listenerManager.registerListenerIntent(key);

	if (!shouldSetup) {
		// Listener already exists or is being set up
		// Return unsubscribe that just decrements ref count
		return () => {
			listenerManager.removeListener(key);
		};
	}

	// Setup function that will be called by ListenerManager
	const setupFn = (onDocumentCount?: (count: number) => void) => {
		let isFirstCall = true;

		return onSnapshot(
			queryRef,
			(snapshot) => {
				// Track document count
				if (onDocumentCount) {
					if (isFirstCall) {
						// On first call, DON'T count existing documents to avoid inflated counts on listener recreation
						// We only want to track NEW documents added after the listener is established
						isFirstCall = false;
					} else {
						// On subsequent calls, only count NEW documents (added)
						const changes = snapshot.docChanges();
						const addedCount = changes.filter((change) => change.type === 'added').length;
						if (addedCount > 0) {
							onDocumentCount(addedCount);
						}
					}
				}
				onNext(snapshot);
			},
			onError,
		);
	};

	// Add listener to manager (we already registered intent synchronously)
	listenerManager.addListener(key, setupFn, { type }).catch((error) => {
		logError(error, { operation: 'controllerUtils.firestoreListenerHelpers.addedCount', metadata: { message: 'Failed to add listener ${key}:' } });
		// Clean up pending state if setup fails
		listenerManager.removeListener(key);
	});

	// Always return unsubscribe function that removes from manager
	// The manager will handle ref counting and only unsubscribe when count reaches 0
	return () => {
		listenerManager.removeListener(key);
	};
}

/**
 * Helper to generate listener keys based on component and resource
 * @param component Component/feature name
 * @param resourceType Resource type (statement, user, etc.)
 * @param resourceId Resource ID
 * @returns Formatted key string
 */
export function generateListenerKey(
	component: string,
	resourceType: string,
	resourceId: string,
): string {
	return `${component}-${resourceType}-${resourceId}`;
}

/**
 * Helper to check if a listener is already active
 * @param key Listener key to check
 * @returns true if listener exists
 */
export function isListenerActive(key: string): boolean {
	return listenerManager.hasListener(key);
}

/**
 * Helper to clean up all listeners for a component
 * @param componentPrefix Component prefix to match
 */
export function cleanupComponentListeners(componentPrefix: string): void {
	listenerManager.removeMatchingListeners(componentPrefix);
	// Logging is handled internally by ListenerManager based on debug mode
}
