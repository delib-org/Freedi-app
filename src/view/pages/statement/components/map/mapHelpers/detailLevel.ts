import type { MapDetailLevel, MapSettings, Results, Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

/**
 * The three kinds of node a map shows, in plain words:
 * - `topic` — a Theme: a topic cluster grouping distinct ideas.
 * - `synth` — a Merged idea: near-duplicate originals merged into one voice.
 * - `raw`   — an Original idea: what a participant actually wrote.
 */
export type NodeKind = 'topic' | 'synth' | 'raw';

export const MAP_DETAIL_LEVELS: MapDetailLevel[] = ['themes', 'ideas', 'everything'];
export const DEFAULT_DETAIL_LEVEL: MapDetailLevel = 'ideas';

/** Deepest cluster nesting the maps draw: topic (1) → synth (2) → original (3). */
const MAX_CLUSTER_DEPTH = 3;

export function isDetailLevel(value: unknown): value is MapDetailLevel {
	return typeof value === 'string' && (MAP_DETAIL_LEVELS as string[]).includes(value);
}

export function kindOf(statement: Statement): NodeKind {
	if (!statement.isCluster) return 'raw';

	return statement.derivedByPipeline === 'synthesis' ? 'synth' : 'topic';
}

/**
 * The depth participants start at. Reads the new `defaultDetail`, else migrates
 * the retired `synthVisibility`, else the app default ('ideas').
 */
export function resolveDefaultDetail(map: MapSettings | undefined): MapDetailLevel {
	if (map?.defaultDetail) return map.defaultDetail;
	switch (map?.synthVisibility) {
		case 'clusters-only':
			return 'themes';
		case 'originals-only':
			return 'everything';
		case 'all':
			return 'ideas';
		default:
			return DEFAULT_DETAIL_LEVEL;
	}
}

/**
 * Whether the level alone folds a node of this kind. Topics fold at `themes`,
 * synths fold below `everything`; originals have nothing to fold.
 */
export function collapsedByLevel(kind: NodeKind, level: MapDetailLevel): boolean {
	if (kind === 'topic') return level === 'themes';
	if (kind === 'synth') return level !== 'everything';

	return false;
}

/** A Results node annotated with everything the two maps need to draw it. */
export interface DetailResults {
	top: Statement;
	sub: DetailResults[];
	kind: NodeKind;
	/** Children exist but are folded away at this level (and not expanded by hand). */
	collapsed: boolean;
	/** A synth merged from a single original — drawn as a plain idea with an "AI-titled" chip. */
	singleSource: boolean;
	/** Nodes dropped because the tree nested deeper than the maps can draw. */
	overflowCount: number;
	/** How deep inside clusters this node sits (root = 0, topic = 1, synth in topic = 2 …). */
	clusterDepth: number;
}

export interface NodeCounts {
	/** Direct ideas under a node: merged ideas + originals not inside a merged idea. */
	ideas: number;
	/** Merged ideas (synths) directly under the node. */
	merged: number;
	/** Every original statement anywhere under the node. */
	voices: number;
}

function countSubtree(results: Results): number {
	return results.sub.reduce((sum, child) => sum + 1 + countSubtree(child), 0);
}

export function countsFor(node: Results): NodeCounts {
	let ideas = 0;
	let merged = 0;
	let voices = 0;
	for (const child of node.sub) {
		const kind = kindOf(child.top);
		if (kind === 'synth') {
			merged += 1;
			ideas += 1;
			voices += child.sub.length;
		} else if (kind === 'raw') {
			ideas += 1;
			voices += 1;
		} else {
			// A nested topic counts its own contents.
			const inner = countsFor(child);
			ideas += inner.ideas;
			merged += inner.merged;
			voices += inner.voices;
		}
	}

	return { ideas, merged, voices };
}

/**
 * Annotate a Results tree for a detail level. Nothing is removed except nodes
 * beyond the drawable depth; folded nodes keep their `sub` so a caller can
 * count them, peek, or expand in place.
 */
export function applyDetailLevel(
	results: Results,
	level: MapDetailLevel,
	expandedIds: ReadonlySet<string>,
): DetailResults {
	let overflowLogged = false;

	function walk(node: Results, parentClusterDepth: number, isRoot: boolean): DetailResults {
		const kind = kindOf(node.top);
		const isCluster = kind !== 'raw';
		const clusterDepth = isRoot ? 0 : isCluster ? parentClusterDepth + 1 : parentClusterDepth;

		// A cluster nested below the drawable depth: keep the node, drop what is
		// under it, and say how much was dropped.
		if (isCluster && clusterDepth > MAX_CLUSTER_DEPTH - 1 && node.sub.length > 0) {
			const overflowCount = countSubtree(node);
			if (!overflowLogged) {
				overflowLogged = true;
				logError(new Error('Cluster nesting exceeds drawable depth'), {
					operation: 'map.transform',
					statementId: node.top.statementId,
					metadata: { clusterDepth, overflowCount },
				});
			}

			return {
				top: node.top,
				sub: [],
				kind,
				collapsed: false,
				singleSource: false,
				overflowCount,
				clusterDepth,
			};
		}

		const sub = node.sub.map((child) => walk(child, clusterDepth, false));
		const singleSource = kind === 'synth' && sub.length <= 1;
		const collapsed =
			!isRoot &&
			sub.length > 0 &&
			collapsedByLevel(kind, level) &&
			!expandedIds.has(node.top.statementId);

		return { top: node.top, sub, kind, collapsed, singleSource, overflowCount: 0, clusterDepth };
	}

	return walk(results, 0, true);
}

export interface Membership {
	parentSynthId?: string;
	parentTopicId?: string;
}

/** statementId → the synth / topic it sits inside, for the whole tree. */
export function buildMembershipMap(results: Results): Map<string, Membership> {
	const map = new Map<string, Membership>();

	function walk(node: Results, inherited: Membership): void {
		const kind = kindOf(node.top);
		const forChildren: Membership =
			kind === 'synth'
				? { ...inherited, parentSynthId: node.top.statementId }
				: kind === 'topic'
					? { ...inherited, parentTopicId: node.top.statementId }
					: inherited;
		for (const child of node.sub) {
			map.set(child.top.statementId, forChildren);
			walk(child, forChildren);
		}
	}

	walk(results, {});

	return map;
}

/**
 * Which nodes take a rating: merged ideas and originals that stand on their
 * own. A theme is a heading, not a proposal, and an original inside a merged
 * idea is already counted through the merge — rating it twice would double a voice.
 */
export function isRatable(
	statement: Statement,
	membership: ReadonlyMap<string, Membership>,
): boolean {
	const kind = kindOf(statement);
	if (kind === 'topic') return false;
	if (kind === 'raw' && membership.get(statement.statementId)?.parentSynthId) return false;

	return true;
}

export interface MinePath {
	/** The first of the viewer's statements in tree order, or null if none. */
	firstId: string | null;
	/** Every statement the viewer wrote (root excluded). */
	mineIds: Set<string>;
	/** Every ancestor (root excluded) of any of the viewer's statements — expand these to reveal them. */
	ancestorIds: Set<string>;
	/** Merged ideas that contain one of the viewer's originals. */
	synthsContainingMine: Set<string>;
	/** Titles from the top-level branch down to `firstId`, for a breadcrumb. */
	breadcrumb: string[];
}

export function pathToMine(results: Results, uid: string | undefined): MinePath {
	const path: MinePath = {
		firstId: null,
		mineIds: new Set(),
		ancestorIds: new Set(),
		synthsContainingMine: new Set(),
		breadcrumb: [],
	};
	if (!uid) return path;

	function walk(node: Results, ancestors: Results[]): void {
		for (const child of node.sub) {
			if (child.top.creatorId === uid) {
				path.mineIds.add(child.top.statementId);
				for (const ancestor of ancestors) {
					path.ancestorIds.add(ancestor.top.statementId);
					if (kindOf(ancestor.top) === 'synth') {
						path.synthsContainingMine.add(ancestor.top.statementId);
					}
				}
				if (!path.firstId) {
					path.firstId = child.top.statementId;
					path.breadcrumb = [...ancestors, child].map((entry) => entry.top.statement);
				}
			}
			walk(child, [...ancestors, child]);
		}
	}

	walk(results, []);

	return path;
}

/** True when the tree has any cluster (theme or merged idea) — the level control is pointless without one. */
export function hasClusters(results: Results): boolean {
	return results.sub.some((child) => child.top.isCluster || hasClusters(child));
}
