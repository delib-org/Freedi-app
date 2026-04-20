import { createSelector } from '@reduxjs/toolkit';
import { Statement, StatementType, CondensationSurfaceVisibility } from '@freedi/shared-types';
import { sortByConsensus } from '@/redux/utils/selectorFactories';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StateSelector<T> = (state: any) => T;

export type CondensationSurface = 'main' | 'massConsensus' | 'join';

export interface GroupedView {
	/** Cluster statements to render as grouped cards. Sorted by consensus desc. */
	groupedSuggestions: Statement[];
	/** Statements to render as regular option cards. In "both" mode this is
	 *  every original; in "clusters-only" it's only originals NOT in any group. */
	visibleOriginals: Statement[];
	/** Map from clusterId → array of originalIds it represents. Used for the
	 *  drill-down view and the "Also represented in" badge on originals. */
	groupMembers: Record<string, string[]>;
	/** Reverse map: originalId → clusterId(s) that represent it. Used for the
	 *  inline badge on an original card. */
	membershipMap: Record<string, string[]>;
	/** Active visibility mode for this surface. */
	mode: CondensationSurfaceVisibility;
	/** Whether the parent enabled drill-down in clusters-only mode. */
	allowDrillToOriginals: boolean;
}

function isOptionLike(statement: Statement): boolean {
	return (
		statement.statementType === StatementType.option ||
		statement.statementType === StatementType.statement
	);
}

function buildMaps(clusters: Statement[]): {
	groupMembers: Record<string, string[]>;
	membershipMap: Record<string, string[]>;
} {
	const groupMembers: Record<string, string[]> = {};
	const membershipMap: Record<string, string[]> = {};
	for (const cluster of clusters) {
		const sources = cluster.integratedOptions ?? [];
		groupMembers[cluster.statementId] = sources;
		for (const sourceId of sources) {
			if (!membershipMap[sourceId]) {
				membershipMap[sourceId] = [];
			}
			membershipMap[sourceId].push(cluster.statementId);
		}
	}

	return { groupMembers, membershipMap };
}

/**
 * Create a selector that returns a "grouped view" of the children under a
 * parent question. The view respects the parent's per-surface visibility
 * setting: either shows both clusters and originals, or only clusters plus
 * ungrouped originals.
 *
 * Originals are never hidden from the database — visibility is a display
 * filter only. Evaluations on originals still aggregate into their cluster
 * via server-side `fn_clusterAggregation`.
 */
export function createGroupedViewSelector(selectStatements: StateSelector<Statement[]>) {
	return (parentId: string | undefined, surface: CondensationSurface) =>
		createSelector([selectStatements], (statements): GroupedView => {
			const parent = statements.find((s) => s.statementId === parentId);
			const condensation = parent?.statementSettings?.condensation;
			const mode: CondensationSurfaceVisibility =
				condensation?.enabled === true ? (condensation.visibility?.[surface] ?? 'both') : 'both';
			const allowDrillToOriginals = condensation?.allowDrillToOriginals ?? true;

			const siblings = statements.filter(
				(s) => s.parentId === parentId && isOptionLike(s) && !s.hide,
			);

			const clusters = siblings.filter((s) => s.isCluster === true);
			const originals = siblings.filter((s) => s.isCluster !== true);

			const { groupMembers, membershipMap } = buildMaps(clusters);

			const groupedSuggestions = [...clusters].sort(sortByConsensus);

			let visibleOriginals: Statement[];
			if (mode === 'clusters-only') {
				// Hide originals that are already represented by a cluster.
				visibleOriginals = originals.filter(
					(o) => !membershipMap[o.statementId] || membershipMap[o.statementId].length === 0,
				);
			} else {
				visibleOriginals = [...originals];
			}
			visibleOriginals.sort(sortByConsensus);

			return {
				groupedSuggestions,
				visibleOriginals,
				groupMembers,
				membershipMap,
				mode,
				allowDrillToOriginals,
			};
		});
}

/**
 * Selector that returns the cluster IDs a given original belongs to. Use this
 * on original cards to render a small "Also represented in: [Group]" badge.
 */
export function createMembershipForOriginalSelector(selectStatements: StateSelector<Statement[]>) {
	return (originalId: string | undefined, parentId: string | undefined) =>
		createSelector([selectStatements], (statements): Statement[] => {
			if (!originalId || !parentId) {
				return [];
			}

			return statements.filter(
				(s) =>
					s.parentId === parentId &&
					s.isCluster === true &&
					(s.integratedOptions ?? []).includes(originalId),
			);
		});
}
