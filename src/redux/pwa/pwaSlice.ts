import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { STORAGE_KEYS } from '@/constants/common';
import { logError } from '@/utils/errorHandling';

interface PWAState {
	/** Number of options the user has created in this session */
	optionsCreated: number;
	/** Whether the user has created a top-level group/statement */
	hasCreatedGroup: boolean;
	/** Whether the install prompt has been shown */
	installPromptShown: boolean;
	/** Timestamp of when the prompt was last dismissed (in ms) */
	lastPromptDismissedAt: number | null;
	/** Whether the user has responded to the install prompt */
	userResponded: boolean;
	/** Per-discussion action counts for the current session (not persisted) */
	discussionActions: Record<string, number>;
	/** Discussion ID that crossed the notification prompt threshold (session-only) */
	notificationPromptDiscussionId: string | null;
}

interface PWATriggerData {
	optionsCreated: number;
	hasCreatedGroup: boolean;
	lastPromptDismissedAt: number | null;
	userResponded: boolean;
}

/**
 * Load PWA trigger data from localStorage
 */
const loadPWATriggerData = (): Partial<PWAState> => {
	try {
		const stored = localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_TRIGGER_DATA);
		if (stored) {
			const data: PWATriggerData = JSON.parse(stored);

			return {
				optionsCreated: data.optionsCreated || 0,
				hasCreatedGroup: data.hasCreatedGroup || false,
				lastPromptDismissedAt: data.lastPromptDismissedAt || null,
				userResponded: data.userResponded || false,
			};
		}
	} catch (error) {
		logError(error, {
			operation: 'redux.pwa.pwaSlice.loadPWATriggerData',
			metadata: { message: 'Failed to load PWA trigger data:' },
		});
	}

	return {};
};

/**
 * Save PWA trigger data to localStorage
 */
const savePWATriggerData = (state: PWAState): void => {
	try {
		const data: PWATriggerData = {
			optionsCreated: state.optionsCreated,
			hasCreatedGroup: state.hasCreatedGroup,
			lastPromptDismissedAt: state.lastPromptDismissedAt,
			userResponded: state.userResponded,
		};
		localStorage.setItem(STORAGE_KEYS.PWA_INSTALL_TRIGGER_DATA, JSON.stringify(data));
	} catch (error) {
		logError(error, {
			operation: 'redux.pwa.pwaSlice.savePWATriggerData',
			metadata: { message: 'Failed to save PWA trigger data:' },
		});
	}
};

/** Minimum actions in a single discussion before showing the notification prompt */
const MIN_DISCUSSION_ACTIONS_FOR_PROMPT = 3;

const initialState: PWAState = {
	optionsCreated: 0,
	hasCreatedGroup: false,
	installPromptShown: false,
	lastPromptDismissedAt: null,
	userResponded: false,
	discussionActions: {},
	notificationPromptDiscussionId: null,
	...loadPWATriggerData(),
};

export const pwaSlice = createSlice({
	name: 'pwa',
	initialState,
	reducers: {
		/**
		 * Increment the count of options created by the user
		 */
		incrementOptionsCreated: (state) => {
			state.optionsCreated += 1;
			savePWATriggerData(state);
		},

		/**
		 * Mark that the user has created a top-level group/statement
		 */
		setHasCreatedGroup: (state, action: PayloadAction<boolean>) => {
			state.hasCreatedGroup = action.payload;
			savePWATriggerData(state);
		},

		/**
		 * Mark that the install prompt has been shown
		 */
		setInstallPromptShown: (state, action: PayloadAction<boolean>) => {
			state.installPromptShown = action.payload;
		},

		/**
		 * Record when the prompt was dismissed
		 */
		setPromptDismissed: (state) => {
			state.lastPromptDismissedAt = Date.now();
			state.userResponded = true;
			savePWATriggerData(state);
		},

		/**
		 * Mark that the user has accepted/installed the PWA
		 */
		setUserAcceptedInstall: (state) => {
			state.userResponded = true;
			savePWATriggerData(state);
		},

		/**
		 * Track an action in a specific discussion.
		 * When actions reach the threshold, sets notificationPromptDiscussionId
		 * so the notification prompt can be shown.
		 */
		trackDiscussionAction: (state, action: PayloadAction<string>) => {
			const discussionId = action.payload;
			const current = state.discussionActions[discussionId] ?? 0;
			const newCount = current + 1;
			state.discussionActions[discussionId] = newCount;

			if (newCount >= MIN_DISCUSSION_ACTIONS_FOR_PROMPT && !state.notificationPromptDiscussionId) {
				state.notificationPromptDiscussionId = discussionId;
			}
		},

		/**
		 * Clear the notification prompt discussion trigger (after prompt is shown/dismissed)
		 */
		clearNotificationPromptTrigger: (state) => {
			state.notificationPromptDiscussionId = null;
		},

		/**
		 * Reset PWA tracking data
		 */
		resetPWATracking: (state) => {
			state.optionsCreated = 0;
			state.hasCreatedGroup = false;
			state.installPromptShown = false;
			state.lastPromptDismissedAt = null;
			state.userResponded = false;
			state.discussionActions = {};
			state.notificationPromptDiscussionId = null;
			savePWATriggerData(state);
		},
	},
});

export const {
	incrementOptionsCreated,
	setHasCreatedGroup,
	setInstallPromptShown,
	setPromptDismissed,
	setUserAcceptedInstall,
	trackDiscussionAction,
	clearNotificationPromptTrigger,
	resetPWATracking,
} = pwaSlice.actions;

// Selectors
export const selectPWAState = (state: { pwa: PWAState }): PWAState => state.pwa;
export const selectOptionsCreated = (state: { pwa: PWAState }): number => state.pwa.optionsCreated;
export const selectHasCreatedGroup = (state: { pwa: PWAState }): boolean =>
	state.pwa.hasCreatedGroup;
export const selectInstallPromptShown = (state: { pwa: PWAState }): boolean =>
	state.pwa.installPromptShown;
export const selectUserResponded = (state: { pwa: PWAState }): boolean => state.pwa.userResponded;
export const selectLastPromptDismissedAt = (state: { pwa: PWAState }): number | null =>
	state.pwa.lastPromptDismissedAt;
export const selectNotificationPromptDiscussionId = (state: { pwa: PWAState }): string | null =>
	state.pwa.notificationPromptDiscussionId;
export const selectDiscussionActionCount = (
	state: { pwa: PWAState },
	discussionId: string,
): number => state.pwa.discussionActions[discussionId] ?? 0;
