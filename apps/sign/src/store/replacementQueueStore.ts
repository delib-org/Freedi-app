/**
 * Replacement Queue Store (Zustand)
 * Manages pending replacement queue with real-time Firebase listeners
 */

import { create } from 'zustand';
import { onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, PendingReplacement, ReplacementQueueStatus } from '@freedi/shared-types';

// Initialize Firestore
const db = getFirebaseFirestore();

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
	subscriptions: Record<string, () => void>;

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
	 * Subscribe to real-time pending replacements
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

		// Create Firebase query
		const q = query(
			collection(db, Collections.paragraphReplacementQueue),
			where('documentId', '==', documentId),
			where('status', '==', ReplacementQueueStatus.pending),
			orderBy(sortBy, order)
		);

		// Create listener
		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const queue: PendingReplacement[] = snapshot.docs.map(
					(doc) => doc.data() as PendingReplacement
				);

				set((state) => ({
					pendingReplacements: { ...state.pendingReplacements, [documentId]: queue },
					isLoading: { ...state.isLoading, [documentId]: false },
					error: { ...state.error, [documentId]: null },
					lastSyncedAt: { ...state.lastSyncedAt, [documentId]: Date.now() },
				}));
			},
			(error) => {
				set((state) => ({
					isLoading: { ...state.isLoading, [documentId]: false },
					error: { ...state.error, [documentId]: error as Error },
				}));
			}
		);

		// Store subscription for cleanup
		set((state) => ({
			subscriptions: { ...state.subscriptions, [documentId]: unsubscribe },
		}));

		return unsubscribe;
	},

	/**
	 * Approve a replacement
	 */
	approveReplacement: async (queueId: string, editedText?: string, notes?: string) => {
		try {
			const response = await fetch(`/api/admin/version-control/queue/${queueId}/action`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
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

			// Queue will update automatically via Firebase listener
			return await response.json();
		} catch (error) {
			throw error;
		}
	},

	/**
	 * Reject a replacement
	 */
	rejectReplacement: async (queueId: string, reason: string) => {
		try {
			const response = await fetch(`/api/admin/version-control/queue/${queueId}/action`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'reject',
					adminNotes: reason,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to reject replacement');
			}

			// Queue will update automatically via Firebase listener
			return await response.json();
		} catch (error) {
			throw error;
		}
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
				const { [documentId]: _, ...remainingSubscriptions } = state.subscriptions;
				return { subscriptions: remainingSubscriptions };
			});
		}
	},
}));
