/**
 * Version Control Settings Store (Zustand)
 * Manages version control settings with Firebase real-time listeners
 */

import { create } from 'zustand';
import { onSnapshot, doc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, Statement } from '@freedi/shared-types';

// Initialize Firestore
const db = getFirebaseFirestore();

/**
 * Version Control Settings Interface
 */
export interface VersionControlSettings {
	enabled: boolean;
	reviewThreshold: number;
	allowAdminEdit: boolean;
	enableVersionHistory: boolean;
	maxRecentVersions: number;
	maxTotalVersions: number;
	lastSettingsUpdate?: number;
	updatedBy?: string;
}

/**
 * Default settings
 */
const DEFAULT_SETTINGS: VersionControlSettings = {
	enabled: false,
	reviewThreshold: 0.5,
	allowAdminEdit: true,
	enableVersionHistory: true,
	maxRecentVersions: 4,
	maxTotalVersions: 50,
};

/**
 * Version Control Store State
 */
interface VersionControlStore {
	// Settings by document ID
	settings: Record<string, VersionControlSettings>;

	// Loading/error states
	isLoading: Record<string, boolean>;
	error: Record<string, Error | null>;
	lastSyncedAt: Record<string, number>;

	// Subscriptions (for cleanup)
	subscriptions: Record<string, () => void>;

	// Actions
	subscribeToSettings: (documentId: string) => () => void;
	updateSettings: (documentId: string, settings: Partial<VersionControlSettings>) => Promise<void>;
	getSettings: (documentId: string) => VersionControlSettings;
	cleanup: (documentId: string) => void;
}

/**
 * Create Version Control Store
 */
export const useVersionControlStore = create<VersionControlStore>((set, get) => ({
	settings: {},
	isLoading: {},
	error: {},
	lastSyncedAt: {},
	subscriptions: {},

	/**
	 * Subscribe to real-time settings updates
	 * Returns unsubscribe function
	 */
	subscribeToSettings: (documentId: string) => {
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

		// Create Firebase listener
		const docRef = doc(db, Collections.statements, documentId);
		const unsubscribe = onSnapshot(
			docRef,
			(snapshot) => {
				if (snapshot.exists()) {
					const document = snapshot.data() as Statement;
					const settingsData = document.doc?.versionControlSettings;

					// Extract settings or use defaults
					const settings: VersionControlSettings = {
						enabled: settingsData?.enabled ?? DEFAULT_SETTINGS.enabled,
						reviewThreshold: settingsData?.reviewThreshold ?? DEFAULT_SETTINGS.reviewThreshold,
						allowAdminEdit: settingsData?.allowAdminEdit ?? DEFAULT_SETTINGS.allowAdminEdit,
						enableVersionHistory:
							settingsData?.enableVersionHistory ?? DEFAULT_SETTINGS.enableVersionHistory,
						maxRecentVersions:
							settingsData?.maxRecentVersions ?? DEFAULT_SETTINGS.maxRecentVersions,
						maxTotalVersions: settingsData?.maxTotalVersions ?? DEFAULT_SETTINGS.maxTotalVersions,
						lastSettingsUpdate: settingsData?.lastSettingsUpdate,
						updatedBy: settingsData?.updatedBy,
					};

					set((state) => ({
						settings: { ...state.settings, [documentId]: settings },
						isLoading: { ...state.isLoading, [documentId]: false },
						error: { ...state.error, [documentId]: null },
						lastSyncedAt: { ...state.lastSyncedAt, [documentId]: Date.now() },
					}));
				} else {
					// Document doesn't exist, use defaults
					set((state) => ({
						settings: { ...state.settings, [documentId]: DEFAULT_SETTINGS },
						isLoading: { ...state.isLoading, [documentId]: false },
						error: { ...state.error, [documentId]: null },
						lastSyncedAt: { ...state.lastSyncedAt, [documentId]: Date.now() },
					}));
				}
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
	 * Update settings via API
	 */
	updateSettings: async (documentId: string, newSettings: Partial<VersionControlSettings>) => {
		try {
			const response = await fetch(`/api/admin/version-control/${documentId}/settings`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newSettings),
				credentials: 'include',
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to update settings');
			}

			// Settings will update automatically via Firebase listener
		} catch (error) {
			set((state) => ({
				error: { ...state.error, [documentId]: error as Error },
			}));
			throw error;
		}
	},

	/**
	 * Get settings for a document (returns defaults if not loaded)
	 */
	getSettings: (documentId: string) => {
		return get().settings[documentId] || DEFAULT_SETTINGS;
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
