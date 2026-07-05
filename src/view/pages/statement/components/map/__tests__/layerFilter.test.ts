/**
 * Tests for filterResultsByLayer — pruning the mind-map tree to the visible
 * layers (raw / synth / clusters, each toggled independently) while promoting
 * visible descendants so nothing is lost when an intermediate node is hidden.
 */

jest.mock('@freedi/shared-types', () => ({}));

import { filterResultsByLayer, type LayerVisibility } from '../mapHelpers/layerFilter';
import type { Results, Statement } from '@freedi/shared-types';

function s(
	id: string,
	opts: { isCluster?: boolean; derivedByPipeline?: 'synthesis' | 'topic-cluster' } = {},
): Statement {
	return { statementId: id, statement: id, ...opts } as unknown as Statement;
}

const vis = (over: Partial<LayerVisibility>): LayerVisibility => ({
	raw: false,
	synth: false,
	clusters: false,
	...over,
});

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
	it('all layers on → returns the tree unchanged', () => {
		const tree = fixture();
		expect(filterResultsByLayer(tree, vis({ raw: true, synth: true, clusters: true }))).toBe(tree);
	});

	it('raw only → drops clusters/synths and promotes every original statement', () => {
		const out = filterResultsByLayer(fixture(), vis({ raw: true }));
		expect(out.top.statementId).toBe('q');
		expect(out.sub.map((r) => r.top.statementId).sort()).toEqual([
			'raw1',
			'raw2',
			'raw3',
			'rawTop',
		]);
		expect(flatten(out)).not.toContain('synth');
		expect(flatten(out)).not.toContain('topic');
	});

	it('synth only → keeps only synth nodes, promoted out of their topic cluster', () => {
		const out = filterResultsByLayer(fixture(), vis({ synth: true }));
		expect(out.sub.map((r) => r.top.statementId)).toEqual(['synth']);
		expect(out.sub[0].sub).toEqual([]);
	});

	it('clusters only → keeps only topic clusters as leaves', () => {
		const out = filterResultsByLayer(fixture(), vis({ clusters: true }));
		expect(out.sub.map((r) => r.top.statementId)).toEqual(['topic']);
		expect(out.sub[0].sub).toEqual([]);
	});

	it('synth + raw → synths keep their members, topic clusters are dropped', () => {
		const out = filterResultsByLayer(fixture(), vis({ synth: true, raw: true }));
		// topic dropped; its children (synth + raw3) promoted to root, plus rawTop.
		expect(out.sub.map((r) => r.top.statementId).sort()).toEqual(['raw3', 'rawTop', 'synth']);
		const synth = out.sub.find((r) => r.top.statementId === 'synth');
		expect(synth?.sub.map((r) => r.top.statementId).sort()).toEqual(['raw1', 'raw2']);
	});

	it('nothing selected → only the root remains', () => {
		const out = filterResultsByLayer(fixture(), vis({}));
		expect(out.top.statementId).toBe('q');
		expect(out.sub).toEqual([]);
	});
});
