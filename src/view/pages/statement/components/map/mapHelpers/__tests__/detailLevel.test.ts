/**
 * The detail-level model: one altitude (themes / ideas / everything) acting as
 * a maximum depth over the topic → synth → original tree, plus per-node expand.
 */

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@freedi/shared-types', () => ({}));

import { logError } from '@/utils/errorHandling';
import type { Results, Statement } from '@freedi/shared-types';
import {
	applyDetailLevel,
	buildMembershipMap,
	countsFor,
	hasClusters,
	isRatable,
	kindOf,
	pathToMine,
	resolveDefaultDetail,
} from '../detailLevel';

type Opts = {
	isCluster?: boolean;
	derivedByPipeline?: 'synthesis' | 'topic-cluster';
	creatorId?: string;
};

function s(id: string, opts: Opts = {}): Statement {
	return { statementId: id, statement: id, ...opts } as unknown as Statement;
}

const topic = (id: string, sub: Results[] = []): Results => ({
	top: s(id, { isCluster: true, derivedByPipeline: 'topic-cluster' }),
	sub,
});
const synth = (id: string, sub: Results[] = []): Results => ({
	top: s(id, { isCluster: true, derivedByPipeline: 'synthesis' }),
	sub,
});
const raw = (id: string, creatorId?: string): Results => ({ top: s(id, { creatorId }), sub: [] });

/**
 *   q
 *   ├ topic
 *   │  ├ synth ── raw1 (mine), raw2
 *   │  └ raw3
 *   ├ lone (synth) ── raw4
 *   └ rawTop
 */
function fixture(): Results {
	return {
		top: s('q'),
		sub: [
			topic('topic', [synth('synth', [raw('raw1', 'me'), raw('raw2')]), raw('raw3')]),
			synth('lone', [raw('raw4')]),
			raw('rawTop'),
		],
	};
}

function find(node: ReturnType<typeof applyDetailLevel>, id: string) {
	if (node.top.statementId === id) return node;
	for (const child of node.sub) {
		const hit = find(child, id);
		if (hit) return hit;
	}

	return null;
}

describe('kindOf', () => {
	it('classifies the three kinds', () => {
		expect(kindOf(topic('t').top)).toBe('topic');
		expect(kindOf(synth('s').top)).toBe('synth');
		expect(kindOf(raw('r').top)).toBe('raw');
		// A cluster with no pipeline tag (manual grouping) is a theme.
		expect(kindOf(s('m', { isCluster: true }))).toBe('topic');
	});
});

describe('resolveDefaultDetail', () => {
	it('prefers the new setting, migrates the old one, defaults to ideas', () => {
		expect(resolveDefaultDetail(undefined)).toBe('ideas');
		expect(resolveDefaultDetail({})).toBe('ideas');
		expect(resolveDefaultDetail({ defaultDetail: 'themes', synthVisibility: 'all' })).toBe(
			'themes',
		);
		expect(resolveDefaultDetail({ synthVisibility: 'clusters-only' })).toBe('themes');
		expect(resolveDefaultDetail({ synthVisibility: 'all' })).toBe('ideas');
		expect(resolveDefaultDetail({ synthVisibility: 'originals-only' })).toBe('everything');
	});
});

describe('applyDetailLevel', () => {
	const none = new Set<string>();

	it('themes: folds topics and synths, keeps originals', () => {
		const tree = applyDetailLevel(fixture(), 'themes', none);
		expect(find(tree, 'topic')?.collapsed).toBe(true);
		expect(find(tree, 'lone')?.collapsed).toBe(true);
		expect(find(tree, 'rawTop')?.collapsed).toBe(false);
		// Folded, not pruned — the members are still there to count.
		expect(find(tree, 'topic')?.sub).toHaveLength(2);
	});

	it('ideas: opens topics, keeps synths folded', () => {
		const tree = applyDetailLevel(fixture(), 'ideas', none);
		expect(find(tree, 'topic')?.collapsed).toBe(false);
		expect(find(tree, 'synth')?.collapsed).toBe(true);
		expect(find(tree, 'lone')?.collapsed).toBe(true);
	});

	it('everything: nothing is folded', () => {
		const tree = applyDetailLevel(fixture(), 'everything', none);
		expect(find(tree, 'topic')?.collapsed).toBe(false);
		expect(find(tree, 'synth')?.collapsed).toBe(false);
	});

	it('a hand-expanded node opens one level past the global depth', () => {
		const tree = applyDetailLevel(fixture(), 'ideas', new Set(['synth']));
		expect(find(tree, 'synth')?.collapsed).toBe(false);
		expect(find(tree, 'lone')?.collapsed).toBe(true);
	});

	it('never folds the root or a childless node', () => {
		const tree = applyDetailLevel({ top: s('q'), sub: [topic('empty')] }, 'themes', none);
		expect(tree.collapsed).toBe(false);
		expect(find(tree, 'empty')?.collapsed).toBe(false);
	});

	it('marks a synth of one as singleSource', () => {
		const tree = applyDetailLevel(fixture(), 'ideas', none);
		expect(find(tree, 'lone')?.singleSource).toBe(true);
		expect(find(tree, 'synth')?.singleSource).toBe(false);
	});

	it('tracks cluster depth and clamps nesting deeper than three levels', () => {
		const deep: Results = {
			top: s('q'),
			sub: [topic('t1', [synth('s2', [topic('t3', [synth('s4', [raw('r5')])])])])],
		};
		const tree = applyDetailLevel(deep, 'everything', none);
		expect(find(tree, 't1')?.clusterDepth).toBe(1);
		expect(find(tree, 's2')?.clusterDepth).toBe(2);
		const t3 = find(tree, 't3');
		expect(t3?.clusterDepth).toBe(3);
		expect(t3?.sub).toHaveLength(0);
		expect(t3?.overflowCount).toBe(2);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'map.transform', statementId: 't3' }),
		);
	});
});

describe('countsFor', () => {
	it('counts ideas, merged ideas and voices', () => {
		expect(countsFor(fixture().sub[0])).toEqual({ ideas: 2, merged: 1, voices: 3 });
		expect(countsFor(fixture())).toEqual({ ideas: 4, merged: 2, voices: 5 });
		expect(countsFor(synth('s', [raw('a'), raw('b')]))).toEqual({ ideas: 2, merged: 0, voices: 2 });
	});
});

describe('membership + isRatable', () => {
	const membership = buildMembershipMap(fixture());

	it('records the synth and topic each node sits inside', () => {
		expect(membership.get('raw1')).toEqual({ parentTopicId: 'topic', parentSynthId: 'synth' });
		expect(membership.get('raw3')).toEqual({ parentTopicId: 'topic' });
		expect(membership.get('synth')).toEqual({ parentTopicId: 'topic' });
		expect(membership.get('rawTop')).toEqual({});
	});

	it('rates merged ideas and standalone originals only', () => {
		const tree = fixture();
		expect(isRatable(tree.sub[0].top, membership)).toBe(false); // topic
		expect(isRatable(tree.sub[0].sub[0].top, membership)).toBe(true); // synth
		expect(isRatable(tree.sub[0].sub[0].sub[0].top, membership)).toBe(false); // raw in synth
		expect(isRatable(tree.sub[0].sub[1].top, membership)).toBe(true); // raw in topic
		expect(isRatable(tree.sub[2].top, membership)).toBe(true); // ungrouped raw
	});
});

describe('pathToMine', () => {
	it('finds the viewer’s statement, its ancestors and the synth holding it', () => {
		const path = pathToMine(fixture(), 'me');
		expect(path.firstId).toBe('raw1');
		expect([...path.mineIds]).toEqual(['raw1']);
		expect([...path.ancestorIds].sort()).toEqual(['synth', 'topic']);
		expect([...path.synthsContainingMine]).toEqual(['synth']);
		expect(path.breadcrumb).toEqual(['topic', 'synth', 'raw1']);
	});

	it('is empty without a user or without a match', () => {
		expect(pathToMine(fixture(), undefined).firstId).toBeNull();
		expect(pathToMine(fixture(), 'nobody').mineIds.size).toBe(0);
	});
});

describe('hasClusters', () => {
	it('is false for a flat question', () => {
		expect(hasClusters({ top: s('q'), sub: [raw('a'), raw('b')] })).toBe(false);
		expect(hasClusters(fixture())).toBe(true);
	});
});
