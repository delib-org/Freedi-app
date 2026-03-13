/**
 * Document Action History Store (Zustand)
 * Manages action history for consensus-driven document changes (removal, addition, replacement)
 */

import { create } from 'zustand';
import { onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, DocumentActionType } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Action history entry (client-side version)
 */
export interface ActionHistoryEntry {
	actionId: string;
	documentId: string;
	paragraphId: string;
	actionType: DocumentActionType;
	previousContent?: string;
	newContent?: string;
	consensus: number;
	evaluatorCount: number;
	executedAt: number;
	queueItemId?: string;
	insertionPointId?: string;
	insertAfterParagraphId?: string;
	newParagraphId?: string;
	undoneAt?: number;
	undoneBy?: string;
	cooldownUntil?: number;
}

/**
 * Action History Store State
 */
interface ActionHistoryStore {
	// History entries by document ID
	entries: Record<string, ActionHistoryEntry[]>;

	// Loading/error states
	isLoading: Record<string, boolean>;
	error: Record<string, Error | null>;

	// Subscriptions (for cleanup)
	subscriptions: Record<string, () => void>;

	// Actions
	subscribeToHistory: (documentId: string) => () => void;
	undoAction: (actionId: string, documentId: string) => Promise<void>;
	getEntries: (documentId: string) => ActionHistoryEntry[];
	getActiveEntries: (documentId: string) => ActionHistoryEntry[];
	cleanup: (documentId: string) => void;
}

/**
 * Create Action History Store
 */
export const useActionHistoryStore = create<ActionHistoryStore>((set, get) => ({
	entries: {},
	isLoading: {},
	error: {},
	subscriptions: {},

	/**
	 * Subscribe to real-time action history for a document
	 */
	subscribeToHistory: (documentId: string) => {
		const existingSub = get().subscriptions[documentId];
		if (existingSub) existingSub();

		set((state) => ({
			isLoading: { ...state.isLoading, [documentId]: true },
			error: { ...state.error, [documentId]: null },
		}));

		try {
			const db = getFirebaseFirestore();
			const q = query(
				collection(db, Collections.documentActionHistory),
				where('documentId', '==', documentId),
				orderBy('executedAt', 'desc')
			);

			const unsubscribe = onSnapshot(
				q,
				(snapshot) => {
					const entries: ActionHistoryEntry[] = [];

					snapshot.forEach((docSnap) => {
						entries.push(docSnap.data() as ActionHistoryEntry);
					});

					set((state) => ({
						entries: { ...state.entries, [documentId]: entries },
						isLoading: { ...state.isLoading, [documentId]: false },
						error: { ...state.error, [documentId]: null },
					}));
				},
				(error) => {
					logError(error, {
						operation: 'actionHistoryStore.subscribeToHistory',
						metadata: { documentId },
					});
					set((state) => ({
						isLoading: { ...state.isLoading, [documentId]: false },
						error: { ...state.error, [documentId]: error as Error },
					}));
				}
			);

			set((state) => ({
				subscriptions: { ...state.subscriptions, [documentId]: unsubscribe },
			}));

			return unsubscribe;
		} catch (error) {
			logError(error, {
				operation: 'actionHistoryStore.subscribeToHistory.setup',
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
	 * Undo an action via API
	 */
	undoAction: async (actionId: string, documentId: string) => {
		try {
			const response = await fetch(`/api/admin/version-control/${documentId}/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ actionId }),
				credentials: 'include',
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to undo action');
			}
		} catch (error) {
			logError(error, {
				operation: 'actionHistoryStore.undoAction',
				metadata: { actionId, documentId },
			});
			throw error;
		}
	},

	/**
	 * Get all entries for a document
	 */
	getEntries: (documentId: string) => {
		return get().entries[documentId] || [];
	},

	/**
	 * Get only active (not undone) entries
	 */
	getActiveEntries: (documentId: string) => {
		const entries = get().entries[documentId] || [];

		return entries.filter((entry) => !entry.undoneAt);
	},

	/**
	 * Cleanup subscription
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
