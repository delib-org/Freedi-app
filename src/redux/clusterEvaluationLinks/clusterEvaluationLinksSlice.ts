import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ClusterEvaluationLink } from '@freedi/shared-types';

/**
 * Redux slice for cluster evaluation provenance records (populated by a
 * lazy Firestore listener scoped to a single cluster at a time).
 */
export interface ClusterEvaluationLinksState {
	/** Keyed by link doc id (`${clusterId}__${userId}`). */
	byId: Record<string, ClusterEvaluationLink>;
}

const initialState: ClusterEvaluationLinksState = {
	byId: {},
};

export const clusterEvaluationLinksSlice = createSlice({
	name: 'clusterEvaluationLinks',
	initialState,
	reducers: {
		setLink(state, action: PayloadAction<ClusterEvaluationLink>) {
			state.byId[action.payload.linkId] = action.payload;
		},
		setLinks(state, action: PayloadAction<ClusterEvaluationLink[]>) {
			for (const link of action.payload) {
				state.byId[link.linkId] = link;
			}
		},
		removeLink(state, action: PayloadAction<string>) {
			delete state.byId[action.payload];
		},
		/** Replace ALL links for a given cluster. Used when a fresh snapshot
		 *  lands from Firestore listener so stale entries get purged. */
		replaceForCluster(
			state,
			action: PayloadAction<{ clusterId: string; links: ClusterEvaluationLink[] }>,
		) {
			const { clusterId, links } = action.payload;
			for (const id of Object.keys(state.byId)) {
				if (state.byId[id].clusterId === clusterId) {
					delete state.byId[id];
				}
			}
			for (const link of links) {
				state.byId[link.linkId] = link;
			}
		},
	},
});

export const { setLink, setLinks, removeLink, replaceForCluster } =
	clusterEvaluationLinksSlice.actions;

/**
 * Select all provenance links for a specific cluster. Memoized factory —
 * per the codebase selector-factory convention.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StateSelector<T> = (state: any) => T;

export function createLinksByClusterSelector(
	selectById: StateSelector<Record<string, ClusterEvaluationLink>>,
) {
	return (clusterId: string | undefined) =>
		createSelector([selectById], (byId) => {
			if (!clusterId) return [] as ClusterEvaluationLink[];

			return Object.values(byId).filter((link) => link.clusterId === clusterId);
		});
}
