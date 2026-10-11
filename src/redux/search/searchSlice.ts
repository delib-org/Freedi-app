import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SearchCandidate } from '@freedi/shared-types';

/**
 * Search candidates downloaded for the home and "everything I follow" scopes.
 *
 * Kept apart from `statements.statementSubscription` on purpose: the home list
 * pages its subscriptions with cursors, and dropping a thousand extra rows into
 * it would break them. Tree search needs no cache — it reads the statements
 * already in the store.
 */

export type SubscriptionSearchScope = 'home' | 'subscriptions';

export interface SearchCandidateCache {
	userId: string;
	candidates: SearchCandidate[];
	fetchedAt: number;
	truncated: boolean;
}

export interface SearchState {
	caches: Partial<Record<SubscriptionSearchScope, SearchCandidateCache>>;
}

interface SearchSliceState {
	search: SearchState;
}

const initialState: SearchState = {
	caches: {},
};

export const searchSlice = createSlice({
	name: 'search',
	initialState,
	reducers: {
		setSearchCandidates: (
			state,
			action: PayloadAction<{ scope: SubscriptionSearchScope; cache: SearchCandidateCache }>,
		) => {
			state.caches[action.payload.scope] = action.payload.cache;
		},
		clearSearchCandidates: (state) => {
			state.caches = {};
		},
	},
});

export const { setSearchCandidates, clearSearchCandidates } = searchSlice.actions;

/** The cache for a scope, only if it belongs to this user. */
export const searchCandidateCacheSelector =
	(scope: SubscriptionSearchScope, userId: string | undefined) =>
	(state: SearchSliceState): SearchCandidateCache | undefined => {
		const cache = state.search.caches[scope];

		return cache && cache.userId === userId ? cache : undefined;
	};

export default searchSlice.reducer;
