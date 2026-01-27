/**
 * Version History Store (Zustand)
 * Manages version history for paragraphs with caching
 */

import { create } from 'zustand';

/**
 * Version entry interface
 */
export interface VersionEntry {
	versionNumber: number;
	text: string;
	replacedAt: number;
	replacedBy?: string;
	consensus?: number;
	finalizedBy?: string;
	adminEdited?: boolean;
	adminNotes?: string;
	isCurrent: boolean;
}

/**
 * Version History Store State
 */
interface VersionHistoryStore {
	// Version history by paragraph ID
	versionHistory: Record<string, VersionEntry[]>;

	// Loading/error states
	isLoading: Record<string, boolean>;
	error: Record<string, Error | null>;
	lastFetchedAt: Record<string, number>;

	// Actions
	loadVersionHistory: (paragraphId: string) => Promise<void>;
	restoreVersion: (paragraphId: string, versionNumber: number, notes?: string) => Promise<void>;
	getHistory: (paragraphId: string) => VersionEntry[];
	getCurrentVersion: (paragraphId: string) => number;
	getVersionByNumber: (paragraphId: string, versionNumber: number) => VersionEntry | null;
	clearCache: (paragraphId?: string) => void;
}

/**
 * Create Version History Store
 */
export const useVersionHistoryStore = create<VersionHistoryStore>((set, get) => ({
	versionHistory: {},
	isLoading: {},
	error: {},
	lastFetchedAt: {},

	/**
	 * Load version history for a paragraph
	 */
	loadVersionHistory: async (paragraphId: string) => {
		// Set loading state
		set((state) => ({
			isLoading: { ...state.isLoading, [paragraphId]: true },
			error: { ...state.error, [paragraphId]: null },
		}));

		try {
			const response = await fetch(`/api/paragraphs/${paragraphId}/versions`);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to load version history');
			}

			const data = await response.json();

			set((state) => ({
				versionHistory: { ...state.versionHistory, [paragraphId]: data.versions },
				isLoading: { ...state.isLoading, [paragraphId]: false },
				error: { ...state.error, [paragraphId]: null },
				lastFetchedAt: { ...state.lastFetchedAt, [paragraphId]: Date.now() },
			}));
		} catch (error) {
			set((state) => ({
				isLoading: { ...state.isLoading, [paragraphId]: false },
				error: { ...state.error, [paragraphId]: error as Error },
			}));
			throw error;
		}
	},

	/**
	 * Restore to a previous version
	 */
	restoreVersion: async (paragraphId: string, versionNumber: number, notes?: string) => {
		try {
			const response = await fetch(`/api/paragraphs/${paragraphId}/restore`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetVersionNumber: versionNumber,
					adminNotes: notes,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to restore version');
			}

			// Reload version history after successful restore
			await get().loadVersionHistory(paragraphId);

			return await response.json();
		} catch (error) {
			throw error;
		}
	},

	/**
	 * Get version history for a paragraph
	 */
	getHistory: (paragraphId: string) => {
		return get().versionHistory[paragraphId] || [];
	},

	/**
	 * Get current version number for a paragraph
	 */
	getCurrentVersion: (paragraphId: string) => {
		const history = get().versionHistory[paragraphId];
		if (!history || history.length === 0) return 1;

		const currentVersion = history.find((v) => v.isCurrent);
		return currentVersion?.versionNumber || 1;
	},

	/**
	 * Get specific version by number
	 */
	getVersionByNumber: (paragraphId: string, versionNumber: number) => {
		const history = get().versionHistory[paragraphId];
		if (!history) return null;

		return history.find((v) => v.versionNumber === versionNumber) || null;
	},

	/**
	 * Clear cache for a paragraph or all paragraphs
	 */
	clearCache: (paragraphId?: string) => {
		if (paragraphId) {
			set((state) => {
				const { [paragraphId]: _, ...remainingHistory } = state.versionHistory;
				const { [paragraphId]: __, ...remainingLoading } = state.isLoading;
				const { [paragraphId]: ___, ...remainingError } = state.error;
				const { [paragraphId]: ____, ...remainingFetchedAt } = state.lastFetchedAt;

				return {
					versionHistory: remainingHistory,
					isLoading: remainingLoading,
					error: remainingError,
					lastFetchedAt: remainingFetchedAt,
				};
			});
		} else {
			set({
				versionHistory: {},
				isLoading: {},
				error: {},
				lastFetchedAt: {},
			});
		}
	},
}));
