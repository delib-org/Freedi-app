import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { UserFeedItem } from '@freedi/shared-types';

/**
 * The home activity feed: when each of the user's top-level discussions last
 * had activity that should re-order the home list (`userFeed.lastActivity`).
 *
 * Kept apart from `statements.statementSubscription` on purpose: a
 * subscription's own `lastUpdate` no longer moves when someone posts in the
 * discussion (that stamp woke three membership triggers per member). The
 * home sort reads activity from here; the topics pager reads its cursor here.
 */
export interface UserFeedState {
	/** userId the entries belong to — entries of another user are never merged. */
	userId: string | null;
	/** statementId (top-level) → lastActivity (ms). */
	lastActivityById: Record<string, number>;
}

interface UserFeedSliceState {
	userFeed: UserFeedState;
}

const initialState: UserFeedState = {
	userId: null,
	lastActivityById: {},
};

export const userFeedSlice = createSlice({
	name: 'userFeed',
	initialState,
	reducers: {
		/** Idempotent upsert; an older value never overwrites a newer one. */
		upsertUserFeedItems: (state, action: PayloadAction<UserFeedItem[]>) => {
			action.payload.forEach((item) => {
				if (state.userId !== item.userId) {
					state.userId = item.userId;
					state.lastActivityById = {};
				}
				const current = state.lastActivityById[item.statementId] ?? 0;
				state.lastActivityById[item.statementId] = Math.max(current, item.lastActivity);
			});
		},
		removeUserFeedItem: (state, action: PayloadAction<string>) => {
			delete state.lastActivityById[action.payload];
		},
		resetUserFeed: () => initialState,
	},
});

export const { upsertUserFeedItems, removeUserFeedItem, resetUserFeed } = userFeedSlice.actions;

const EMPTY_ACTIVITY: Record<string, number> = {};

/** Tolerates stores/tests that do not mount the slice. */
export const selectUserFeedActivity = (
	state: Partial<UserFeedSliceState>,
): Record<string, number> => state.userFeed?.lastActivityById ?? EMPTY_ACTIVITY;

/** Oldest loaded feed activity — the topics pager's cursor. Null when nothing is loaded. */
export const selectOldestUserFeedActivity = (state: Partial<UserFeedSliceState>): number | null => {
	const values = Object.values(selectUserFeedActivity(state));

	return values.length ? Math.min(...values) : null;
};
