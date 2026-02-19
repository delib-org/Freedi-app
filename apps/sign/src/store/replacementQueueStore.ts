/**
 * Replacement Queue Store (Zustand)
 * Real-time Firestore listener for pending replacement queue
 */

import { create } from 'zustand';
import { collection, query, where, orderBy, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseFirestore, getFirebaseAuth } from '@/lib/firebase/client';
import { Collections, PendingReplacement, ReplacementQueueStatus } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Replacement Queue Store State
 */
interface ReplacementQueueStore {
	// Queue items by document ID
	pendingReplacements: Record<string, PendingReplacement[]>;

	// Loading/error states
	isLoading: Record<string, boolean>;
	error: Record<string, Error | null>;
	lastSyncedAt: Record<string, number>;

	// Subscriptions (for cleanup)
	subscriptions: Record<string, Unsubscribe>;

	// Actions
	subscribeToPendingReplacements: (documentId: string, sortBy?: string, order?: 'asc' | 'desc') => () => void;
	approveReplacement: (queueId: string, editedText?: string, notes?: string) => Promise<void>;
	rejectReplacement: (queueId: string, reason: string) => Promise<void>;
	getPendingCount: (documentId: string) => number;
	getPendingForParagraph: (paragraphId: string) => PendingReplacement | null;
	cleanup: (documentId: string) => void;
}

/**
 * Create Replacement Queue Store
 */
export const useReplacementQueueStore = create<ReplacementQueueStore>((set, get) => ({
	pendingReplacements: {},
	isLoading: {},
	error: {},
	lastSyncedAt: {},
	subscriptions: {},

	/**
	 * Subscribe to pending replacements via real-time Firestore listener
	 * Returns unsubscribe function
	 */
	subscribeToPendingReplacements: (documentId: string, sortBy = 'consensus', order: 'asc' | 'desc' = 'desc') => {
		// Clean up existing subscription
		const existingSub = get().subscriptions[documentId];
		if (existingSub) {
			existingSub();
		}

		// Set loading state
		set((state) => ({
			isLoading: { ...state.isLoading, [documentId]: true },
			error: { ...state.error, [documentId]: null },
		}));

		// Create a wrapper unsubscribe function that can be returned immediately
		// It will hold references to the actual unsubscribers
		let authUnsubscribe: Unsubscribe | null = null;
		let firestoreUnsubscribe: Unsubscribe | null = null;

		try {
			const auth = getFirebaseAuth();

			// Listen for auth state changes to ensure we only query when authenticated
			authUnsubscribe = onAuthStateChanged(auth, (user) => {
				// If user is not logged in, we can't listen to this collection (requires auth)
				if (!user) {
					// If we were listening, stop
					if (firestoreUnsubscribe) {
						firestoreUnsubscribe();
						firestoreUnsubscribe = null;
					}
					return;
				}

				// If already listening, do nothing (or could re-setup if needed)
				if (firestoreUnsubscribe) return;

				try {
					const firestore = getFirebaseFirestore();

					// Query pending replacements for this document
					const q = query(
						collection(firestore, Collections.paragraphReplacementQueue),
						where('documentId', '==', documentId),
						where('status', '==', ReplacementQueueStatus.pending),
						orderBy(sortBy, order)
					);

					// Set up real-time listener
					firestoreUnsubscribe = onSnapshot(
						q,
						(snapshot) => {
							const queue: PendingReplacement[] = [];

							snapshot.forEach((doc) => {
								queue.push(doc.data() as PendingReplacement);
							});

							set((state) => ({
								pendingReplacements: { ...state.pendingReplacements, [documentId]: queue },
								isLoading: { ...state.isLoading, [documentId]: false },
								error: { ...state.error, [documentId]: null },
								lastSyncedAt: { ...state.lastSyncedAt, [documentId]: Date.now() },
							}));

							console.info('[ReplacementQueueStore] Queue updated:', queue.length, 'items');
						},
						(error) => {
							logError(error, {
								operation: 'ReplacementQueueStore.onSnapshot',
								metadata: { documentId },
							});
							set((state) => ({
								isLoading: { ...state.isLoading, [documentId]: false },
								error: { ...state.error, [documentId]: error as Error },
							}));
						}
					);
				} catch (error) {
					logError(error, {
						operation: 'ReplacementQueueStore.setupFirestoreListener',
						metadata: { documentId },
					});
					set((state) => ({
						isLoading: { ...state.isLoading, [documentId]: false },
						error: { ...state.error, [documentId]: error as Error },
					}));
				}
			});

			// finalUnsubscribe function to clean up everything
			const finalUnsubscribe = () => {
				if (authUnsubscribe) authUnsubscribe();
				if (firestoreUnsubscribe) firestoreUnsubscribe();
			};

			// Store subscription for cleanup
			set((state) => ({
				subscriptions: { ...state.subscriptions, [documentId]: finalUnsubscribe },
			}));

			return finalUnsubscribe;
		} catch (error) {
			logError(error, {
				operation: 'ReplacementQueueStore.subscribeToPendingReplacements',
				metadata: { documentId },
			});
			set((state) => ({
				isLoading: { ...state.isLoading, [documentId]: false },
				error: { ...state.error, [documentId]: error as Error },
			}));

			return () => {};
		}
	},

	/**
	 * Approve a replacement
	 */
	approveReplacement: async (queueId: string, editedText?: string, notes?: string) => {
		const response = await fetch(`/api/admin/version-control/queue/${queueId}/action`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				action: 'approve',
				adminEditedText: editedText,
				adminNotes: notes,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to approve replacement');
		}

		// Queue updates automatically via Firestore listener
		return await response.json();
	},

	/**
	 * Reject a replacement
	 */
	rejectReplacement: async (queueId: string, reason: string) => {
		const response = await fetch(`/api/admin/version-control/queue/${queueId}/action`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				action: 'reject',
				adminNotes: reason,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to reject replacement');
		}

		// Queue updates automatically via Firestore listener
		return await response.json();
	},

	/**
	 * Get count of pending replacements for a document
	 */
	getPendingCount: (documentId: string) => {
		return get().pendingReplacements[documentId]?.length || 0;
	},

	/**
	 * Get pending replacement for a specific paragraph
	 */
	getPendingForParagraph: (paragraphId: string) => {
		const allQueues = Object.values(get().pendingReplacements).flat();
		return allQueues.find((item) => item.paragraphId === paragraphId) || null;
	},

	/**
	 * Cleanup subscription for a document
	 */
	cleanup: (documentId: string) => {
		const subscription = get().subscriptions[documentId];
		if (subscription) {
			subscription();
			set((state) => {
				const newSubscriptions = { ...state.subscriptions };
				delete newSubscriptions[documentId];
				return { subscriptions: newSubscriptions };
			});
		}
	},
}));
