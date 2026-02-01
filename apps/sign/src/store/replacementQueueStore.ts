/**
 * Replacement Queue Store (Zustand)
 * Manages pending replacement queue via API (to bypass Firestore auth issues)
 */

import { create } from 'zustand';
import { PendingReplacement } from '@freedi/shared-types';

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
	 * Subscribe to pending replacements via API polling
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

		// Fetch function
		const fetchQueue = async () => {
			try {
				const response = await fetch(
					`/api/admin/version-control/${documentId}/queue?sortBy=${sortBy}&order=${order}`,
					{ credentials: 'include' }
				);

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || 'Failed to fetch queue');
				}

				const data = await response.json();
				const queue: PendingReplacement[] = data.queue || [];

				set((state) => ({
					pendingReplacements: { ...state.pendingReplacements, [documentId]: queue },
					isLoading: { ...state.isLoading, [documentId]: false },
					error: { ...state.error, [documentId]: null },
					lastSyncedAt: { ...state.lastSyncedAt, [documentId]: Date.now() },
				}));
			} catch (error) {
				set((state) => ({
					isLoading: { ...state.isLoading, [documentId]: false },
					error: { ...state.error, [documentId]: error as Error },
				}));
			}
		};

		// Initial fetch
		fetchQueue();

		// Poll every 10 seconds for updates
		const intervalId = setInterval(fetchQueue, 10000);

		// Unsubscribe function
		const unsubscribe = () => {
			clearInterval(intervalId);
		};

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
				const newSubscriptions = { ...state.subscriptions };
				delete newSubscriptions[documentId];
				return { subscriptions: newSubscriptions };
			});
		}
	},
}));
