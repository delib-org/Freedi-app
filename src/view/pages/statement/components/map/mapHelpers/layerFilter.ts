import { Results, Statement } from '@freedi/shared-types';

/**
 * The layer a statement belongs to in the deliberation:
 * - `raw`      — an original statement (not a cluster).
 * - `synth`    — a synthesis cluster ("merged voice" node).
 * - `clusters` — a topic cluster (theme grouping).
 */
export type MapLayer = 'raw' | 'synth' | 'clusters';

export const MAP_LAYERS: MapLayer[] = ['raw', 'synth', 'clusters'];

/** Which layers are currently shown. Each can be toggled independently. */
export type LayerVisibility = Record<MapLayer, boolean>;

export const ALL_LAYERS_VISIBLE: LayerVisibility = { raw: true, synth: true, clusters: true };

export function layerOf(statement: Statement): MapLayer {
	if (!statement.isCluster) return 'raw';

	return statement.derivedByPipeline === 'synthesis' ? 'synth' : 'clusters';
}

/**
 * Prune a built Results tree to the visible layers. Nodes whose layer is hidden
 * are dropped, but their visible descendants are promoted up to the nearest kept
 * ancestor — so showing only "raw" still surfaces members hidden under a synth,
 * and showing "synth" + "raw" shows synths with their members but no topic
 * cluster wrappers. The root statement is always kept as the tree's anchor.
 */
export function filterResultsByLayer(results: Results, visibility: LayerVisibility): Results {
	// Fast path: everything visible → return the tree as-is (full nested view).
	if (visibility.raw && visibility.synth && visibility.clusters) return results;

	function prune(node: Results, isRoot: boolean): Results[] {
		const sub = node.sub.flatMap((child) => prune(child, false));

		if (isRoot || visibility[layerOf(node.top)]) {
			return [{ top: node.top, sub }];
		}

		// Node hidden — promote its kept descendants into its parent.
		return sub;
	}

	return prune(results, true)[0];
}
