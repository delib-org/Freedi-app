import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { STORAGE_KEYS } from '@/constants/common';

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
		console.error('Failed to load PWA trigger data:', error);
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
		console.error('Failed to save PWA trigger data:', error);
	}
};

const initialState: PWAState = {
	optionsCreated: 0,
	hasCreatedGroup: false,
	installPromptShown: false,
	lastPromptDismissedAt: null,
	userResponded: false,
	...loadPWATriggerData(),
};

const pwaSlice = createSlice({
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
		 * Reset PWA tracking data
		 */
		resetPWATracking: (state) => {
			state.optionsCreated = 0;
			state.hasCreatedGroup = false;
			state.installPromptShown = false;
			state.lastPromptDismissedAt = null;
			state.userResponded = false;
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

export default pwaSlice.reducer;
