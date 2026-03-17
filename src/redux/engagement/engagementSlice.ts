import { createSlice, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { UserEngagement, CreditTransaction, Badge } from '@freedi/shared-types';
import { EngagementLevel } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

interface EngagementState {
	userEngagement: UserEngagement | null;
	recentCredits: CreditTransaction[];
	loading: boolean;
	error: string | null;
}

const initialState: EngagementState = {
	userEngagement: null,
	recentCredits: [],
	loading: true,
	error: null,
};

export const engagementSlice = createSlice({
	name: 'engagement',
	initialState,
	reducers: {
		setUserEngagement: (state, action: PayloadAction<UserEngagement | null>) => {
			try {
				state.userEngagement = action.payload;
				state.loading = false;
				state.error = null;
			} catch (error) {
				logError(error, { operation: 'redux.engagementSlice.setUserEngagement' });
			}
		},
		setRecentCredits: (state, action: PayloadAction<CreditTransaction[]>) => {
			try {
				state.recentCredits = action.payload;
			} catch (error) {
				logError(error, { operation: 'redux.engagementSlice.setRecentCredits' });
			}
		},
		setEngagementLoading: (state, action: PayloadAction<boolean>) => {
			state.loading = action.payload;
		},
		setEngagementError: (state, action: PayloadAction<string | null>) => {
			state.error = action.payload;
			state.loading = false;
		},
		clearEngagement: (state) => {
			state.userEngagement = null;
			state.recentCredits = [];
			state.loading = false;
			state.error = null;
		},
	},
});

export const {
	setUserEngagement,
	setRecentCredits,
	setEngagementLoading,
	setEngagementError,
	clearEngagement,
} = engagementSlice.actions;

// Selectors - use narrowly-typed state to avoid circular dependency with store.ts

type EngagementSliceState = { engagement: EngagementState };

export const userEngagementSelector = (state: EngagementSliceState) =>
	state.engagement.userEngagement;

export const engagementLoadingSelector = (state: EngagementSliceState) =>
	state.engagement.loading;

export const recentCreditsSelector = (state: EngagementSliceState) =>
	state.engagement.recentCredits;

export const userLevelSelector = createSelector(
	[(state: EngagementSliceState) => state.engagement.userEngagement],
	(engagement): EngagementLevel => engagement?.level ?? EngagementLevel.OBSERVER,
);

export const totalCreditsSelector = createSelector(
	[(state: EngagementSliceState) => state.engagement.userEngagement],
	(engagement): number => engagement?.totalCredits ?? 0,
);

export const userBadgesSelector = createSelector(
	[(state: EngagementSliceState) => state.engagement.userEngagement],
	(engagement): Badge[] => engagement?.badges ?? [],
);

export const currentStreakSelector = createSelector(
	[(state: EngagementSliceState) => state.engagement.userEngagement],
	(engagement): number => engagement?.streak?.currentStreak ?? 0,
);

export const isTrialModeSelector = createSelector(
	[(state: EngagementSliceState) => state.engagement.userEngagement],
	(engagement): boolean => {
		if (!engagement?.trialModeActive || !engagement?.trialModeExpiresAt) return false;

		return Date.now() < engagement.trialModeExpiresAt;
	},
);

export default engagementSlice.reducer;
