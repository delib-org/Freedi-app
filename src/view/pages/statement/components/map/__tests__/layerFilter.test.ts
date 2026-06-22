/**
 * Tests for filterResultsByLayer — pruning the mind-map tree to a single layer
 * (raw / synth / clusters) while promoting matching descendants so nothing is
 * lost when an intermediate node is dropped.
 */

jest.mock('@freedi/shared-types', () => ({}));

import { filterResultsByLayer } from '../mapHelpers/layerFilter';
import type { Results, Statement } from '@freedi/shared-types';

function s(
	id: string,
	opts: { isCluster?: boolean; derivedByPipeline?: 'synthesis' | 'topic-cluster' } = {},
): Statement {
	return { statementId: id, statement: id, ...opts } as unknown as Statement;
}

/**
 * Build the nested fixture:
 *   q
 *   └ topic (topic-cluster)
 *      ├ synth (synthesis)
 *      │  ├ raw1
 *      │  └ raw2
 *      └ raw3
 *   └ rawTop (un-clustered, directly under q)
 */
function fixture(): Results {
	return {
		top: s('q'),
		sub: [
			{
				top: s('topic', { isCluster: true, derivedByPipeline: 'topic-cluster' }),
				sub: [
					{
						top: s('synth', { isCluster: true, derivedByPipeline: 'synthesis' }),
						sub: [
							{ top: s('raw1'), sub: [] },
							{ top: s('raw2'), sub: [] },
						],
					},
					{ top: s('raw3'), sub: [] },
				],
			},
			{ top: s('rawTop'), sub: [] },
		],
	};
}

function flatten(node: Results): string[] {
	return [node.top.statementId, ...node.sub.flatMap(flatten)];
}

describe('filterResultsByLayer', () => {
	it('all → returns the tree unchanged', () => {
		const tree = fixture();
		expect(filterResultsByLayer(tree, 'all')).toBe(tree);
	});

	it('raw → drops clusters/synths and promotes every original statement', () => {
		const out = filterResultsByLayer(fixture(), 'raw');
		expect(out.top.statementId).toBe('q');
		// All raw statements become (promoted) children of the root; no clusters remain.
		expect(out.sub.map((r) => r.top.statementId).sort()).toEqual([
			'raw1',
			'raw2',
			'raw3',
			'rawTop',
		]);
		expect(flatten(out)).not.toContain('synth');
		expect(flatten(out)).not.toContain('topic');
	});

	it('synth → keeps only synth nodes, promoted out of their topic cluster', () => {
		const out = filterResultsByLayer(fixture(), 'synth');
		expect(out.sub.map((r) => r.top.statementId)).toEqual(['synth']);
		// Synth is shown as a leaf (its raw members are not part of this layer).
		expect(out.sub[0].sub).toEqual([]);
	});

	it('clusters → keeps only topic clusters as leaves', () => {
		const out = filterResultsByLayer(fixture(), 'clusters');
		expect(out.sub.map((r) => r.top.statementId)).toEqual(['topic']);
		expect(out.sub[0].sub).toEqual([]);
	});
});
