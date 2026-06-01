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
	/** Flat set of every originalId represented by a rendered cluster (synthesis
	 *  or framing). Consumers hide these from the flat list to avoid showing the
	 *  same idea twice (once inside its cluster, once standalone). */
	groupedMemberIds: Set<string>;
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
 * All clusters (synthesis + topic-cluster) are surfaced; clusters are
 * identified purely by `isCluster === true` and membership by
 * `integratedOptions`.
 *
 * Originals are never hidden from the database — visibility is a display
 * filter only. Evaluations on originals still aggregate into their cluster
 * via server-side cluster aggregation.
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
			const groupedMemberIds = new Set(Object.keys(membershipMap));

			const groupedSuggestions = [...clusters].sort(sortByConsensus);

			let visibleOriginals: Statement[];
			if (mode === 'clusters-only') {
				// Hide originals that are already represented by a cluster.
				visibleOriginals = originals.filter((o) => !groupedMemberIds.has(o.statementId));
			} else {
				visibleOriginals = [...originals];
			}
			visibleOriginals.sort(sortByConsensus);

			return {
				groupedSuggestions,
				visibleOriginals,
				groupMembers,
				membershipMap,
				groupedMemberIds,
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

// ============================================================================
// VIEW LAYERS — the three-toggle model (Raw / Synth / Cluster)
//
// Data is flat: synthesis clusters and topic clusters are siblings, each
// `integratedOptions` pointing straight at raw option ids. We DERIVE a
// synth→topic nesting (assign each synth to the topic it shares the most raw
// members with) so the Cluster view can show synth proposals nested inside a
// topic card. The toggle-independent derivation lives in the selector
// (memoized); `composeViewLayers` applies the three booleans and is a pure,
// fully unit-tested function.
// ============================================================================

export interface ViewLayersToggleState {
	raw: boolean;
	synth: boolean;
	cluster: boolean;
}

export interface ViewLayersData {
	/** Synthesis clusters under the parent, sorted by consensus desc. */
	synthClusters: Statement[];
	/** Non-synthesis ("topic") clusters, sorted by consensus desc. */
	topicClusters: Statement[];
	/** Raw (non-cluster) originals, sorted by consensus desc. */
	rawOriginals: Statement[];
	/** Lookup for any sibling (cluster or raw) by id. */
	byId: Record<string, Statement>;
	/** synthClusterId → topicClusterId it shares the most raw members with,
	 *  or null when it shares none (renders top-level). */
	synthToTopic: Record<string, string | null>;
}

function overlapCount(ids: string[], set: Set<string>): number {
	let n = 0;
	for (const id of ids) if (set.has(id)) n++;

	return n;
}

/**
 * Toggle-independent derivation for the view-layer model. Splits siblings into
 * synth/topic/raw and computes the synth→topic assignment. Memoized so toggling
 * Raw/Synth/Cluster never recomputes this.
 */
export function createViewLayersDataSelector(selectStatements: StateSelector<Statement[]>) {
	return (parentId: string | undefined) =>
		createSelector([selectStatements], (statements): ViewLayersData => {
			const siblings = statements.filter(
				(s) => s.parentId === parentId && isOptionLike(s) && !s.hide,
			);
			const synthClusters = siblings
				.filter((s) => s.isCluster === true && s.derivedByPipeline === 'synthesis')
				.sort(sortByConsensus);
			const topicClusters = siblings
				.filter((s) => s.isCluster === true && s.derivedByPipeline !== 'synthesis')
				.sort(sortByConsensus);
			const rawOriginals = siblings.filter((s) => s.isCluster !== true).sort(sortByConsensus);

			const byId: Record<string, Statement> = {};
			for (const s of siblings) byId[s.statementId] = s;

			// Assign each synth to a topic. Two signals, in priority order:
			//   1. Direct link — a topic whose `integratedOptions` includes the
			//      synth's id (the explicit 3-level encoding: topic → synth → raw).
			//   2. Member overlap — the topic the synth shares the most raw members
			//      with (heuristic for flat data with no explicit link).
			// topicClusters is sorted by consensus desc, so ties resolve to the
			// higher-consensus topic (first match). No signal → null (top-level).
			const topicMemberSets = topicClusters.map(
				(t) => [t.statementId, new Set(t.integratedOptions ?? [])] as const,
			);
			const synthToTopic: Record<string, string | null> = {};
			for (const synth of synthClusters) {
				const directTopic = topicClusters.find((t) =>
					(t.integratedOptions ?? []).includes(synth.statementId),
				);
				if (directTopic) {
					synthToTopic[synth.statementId] = directTopic.statementId;
					continue;
				}
				const members = synth.integratedOptions ?? [];
				let bestId: string | null = null;
				let bestOverlap = 0;
				for (const [topicId, memberSet] of topicMemberSets) {
					const n = overlapCount(members, memberSet);
					if (n > bestOverlap) {
						bestOverlap = n;
						bestId = topicId;
					}
				}
				synthToTopic[synth.statementId] = bestId;
			}

			return { synthClusters, topicClusters, rawOriginals, byId, synthToTopic };
		});
}

export interface NestedSynth {
	synth: Statement;
	/** Resolved raw member statements of this synth. */
	rawMembers: Statement[];
}

export interface TopicCard {
	cluster: Statement;
	/** Synth proposals nested under this topic (empty when Synth toggle off). */
	nestedSynths: NestedSynth[];
	/** Raw members of the topic not already shown under a nested synth. */
	directRaw: Statement[];
}

export interface ViewLayersPlan {
	/** Synth cards rendered at the top level (no topic parent). */
	topLevelSynths: Statement[];
	/** Topic-cluster cards with their nested synths + direct raw. */
	topicCards: TopicCard[];
	/** Raw ideas shown flat (not nested under any shown layer). */
	flatRaw: Statement[];
}

/**
 * Pure: turn derived data + the three toggles into a render plan. Encapsulates
 * all dedup so a raw idea never appears twice and a synth shown nested is not
 * also a top-level card.
 */
export function composeViewLayers(
	data: ViewLayersData,
	toggles: ViewLayersToggleState,
): ViewLayersPlan {
	const { synthClusters, topicClusters, rawOriginals, byId, synthToTopic } = data;
	const resolveRaw = (ids: string[]): Statement[] =>
		ids.map((id) => byId[id]).filter((s): s is Statement => Boolean(s) && s.isCluster !== true);

	const topLevelSynths: Statement[] = [];
	const topicCards: TopicCard[] = [];
	const coveredRawIds = new Set<string>(); // raw ids nested under a shown layer

	if (toggles.cluster) {
		for (const cluster of topicClusters) {
			const assignedSynths = toggles.synth
				? synthClusters.filter((s) => synthToTopic[s.statementId] === cluster.statementId)
				: [];
			const synthCoveredRaw = new Set<string>();
			const nestedSynths: NestedSynth[] = assignedSynths.map((synth) => {
				const rawMembers = resolveRaw(synth.integratedOptions ?? []);
				rawMembers.forEach((m) => synthCoveredRaw.add(m.statementId));

				return { synth, rawMembers };
			});

			const allTopicRaw = resolveRaw(cluster.integratedOptions ?? []);
			const directRaw = allTopicRaw.filter(
				(m) => !synthCoveredRaw.has(m.statementId) && !coveredRawIds.has(m.statementId),
			);

			topicCards.push({ cluster, nestedSynths, directRaw });

			allTopicRaw.forEach((m) => coveredRawIds.add(m.statementId));
			synthCoveredRaw.forEach((id) => coveredRawIds.add(id));
		}

		// Synths with no topic overlap render at the top level (when Synth on).
		if (toggles.synth) {
			for (const synth of synthClusters) {
				if (synthToTopic[synth.statementId] === null) {
					topLevelSynths.push(synth);
					resolveRaw(synth.integratedOptions ?? []).forEach((m) =>
						coveredRawIds.add(m.statementId),
					);
				}
			}
		}
	} else if (toggles.synth) {
		// No clustering: every synth renders top-level; its raw members live in the
		// synth's own drawer (and are therefore covered / not shown flat).
		for (const synth of synthClusters) {
			topLevelSynths.push(synth);
			resolveRaw(synth.integratedOptions ?? []).forEach((m) => coveredRawIds.add(m.statementId));
		}
	}

	const flatRaw = toggles.raw ? rawOriginals.filter((r) => !coveredRawIds.has(r.statementId)) : [];

	return { topLevelSynths, topicCards, flatRaw };
}
