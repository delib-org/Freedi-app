import { Results, Statement } from '@freedi/shared-types';

/**
 * Which layer of the deliberation the mind map should show.
 * - `all`     — full nested view (clusters → synths → statements).
 * - `raw`     — only the original statements (clusters/synths removed, their
 *               members promoted up so nothing is lost).
 * - `synth`   — only synthesis clusters ("merged voice" nodes).
 * - `clusters`— only topic clusters (theme groupings).
 */
export type MapLayerFilter = 'all' | 'raw' | 'synth' | 'clusters';

export const MAP_LAYER_FILTERS: MapLayerFilter[] = ['all', 'raw', 'synth', 'clusters'];

function matchesLayer(statement: Statement, filter: MapLayerFilter): boolean {
	switch (filter) {
		case 'raw':
			return !statement.isCluster;
		case 'synth':
			return !!statement.isCluster && statement.derivedByPipeline === 'synthesis';
		case 'clusters':
			return !!statement.isCluster && statement.derivedByPipeline !== 'synthesis';
		default:
			return true;
	}
}

/**
 * Prune a built Results tree down to a single layer. Nodes that don't match the
 * filter are dropped, but their matching descendants are promoted up to the
 * nearest kept ancestor — so "raw" still surfaces members hidden under a synth,
 * and "synth" surfaces synths nested inside a topic cluster. The root statement
 * is always kept as the tree's anchor.
 */
export function filterResultsByLayer(results: Results, filter: MapLayerFilter): Results {
	if (filter === 'all') return results;

	function prune(node: Results, isRoot: boolean): Results[] {
		const sub = node.sub.flatMap((child) => prune(child, false));

		if (isRoot || matchesLayer(node.top, filter)) {
			return [{ top: node.top, sub }];
		}

		// Node dropped — promote its kept descendants into its parent.
		return sub;
	}

	return prune(results, true)[0];
}
