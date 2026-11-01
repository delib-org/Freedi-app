import type { Evaluation } from '@freedi/shared-types';
import {
	ClusterNode,
	ClusterStatementLike,
	buildClusterTree,
	collectInnerNodeIds,
	collectTreeIds,
	computeEffectiveTreeVote,
	flatClusterTree,
} from '../clusterTree';
import { computeEffectiveClusterVote } from '../clusterVoteRule';
import { computeClusterEvaluationFromRawEvals } from '../aggregation';

type Votes = Record<string, number>;

function votesOf(votes: Votes): Map<string, Pick<Evaluation, 'evaluation'>> {
	return new Map(Object.entries(votes).map(([id, evaluation]) => [id, { evaluation }]));
}

function evalOf(evaluatorId: string, statementId: string, evaluation: number): Evaluation {
	return {
		evaluationId: `${evaluatorId}--${statementId}`,
		evaluatorId,
		statementId,
		parentId: 'q1',
		evaluation,
		updatedAt: 1,
	} as Evaluation;
}

function lookup(docs: Record<string, ClusterStatementLike>) {
	return (id: string): ClusterStatementLike | undefined => docs[id];
}

const THEME_DOCS: Record<string, ClusterStatementLike> = {
	T: { isCluster: true, integratedOptions: ['S1', 'S2', 'o5'] },
	S1: { isCluster: true, integratedOptions: ['o1', 'o2'] },
	S2: { isCluster: true, integratedOptions: ['o3', 'o4'] },
	o1: {},
	o2: {},
	o3: {},
	o4: {},
	o5: {},
};

describe('buildClusterTree', () => {
	it('expands members that are clusters and keeps plain options as leaves', () => {
		const tree = buildClusterTree('T', lookup(THEME_DOCS));

		expect(tree.children.map((c) => c.id)).toEqual(['S1', 'S2', 'o5']);
		expect(tree.children[0].children.map((c) => c.id)).toEqual(['o1', 'o2']);
		expect(tree.children[2].children).toEqual([]);
		expect(collectTreeIds(tree).sort()).toEqual(['S1', 'S2', 'T', 'o1', 'o2', 'o3', 'o4', 'o5']);
		expect(collectInnerNodeIds(tree).sort()).toEqual(['S1', 'S2', 'T']);
	});

	it('treats an unknown id as a leaf and dedupes repeated members', () => {
		const tree = buildClusterTree(
			'T',
			lookup({ T: { isCluster: true, integratedOptions: ['x', 'x', 'y'] } }),
		);

		expect(tree.children.map((c) => c.id)).toEqual(['x', 'y']);
	});

	it('includes absorbed cluster ids of nested nodes in the source ids', () => {
		const tree = buildClusterTree(
			'T',
			lookup({
				T: { isCluster: true, integratedOptions: ['S1'], absorbedClusterIds: ['gone1'] },
				S1: { isCluster: true, integratedOptions: ['o1'], absorbedClusterIds: ['gone2'] },
			}),
		);

		expect(collectTreeIds(tree).sort()).toEqual(['S1', 'T', 'gone1', 'gone2', 'o1']);
	});

	it('terminates on a cycle (A lists B, B lists A)', () => {
		const tree = buildClusterTree(
			'A',
			lookup({
				A: { isCluster: true, integratedOptions: ['B'] },
				B: { isCluster: true, integratedOptions: ['A', 'o1'] },
			}),
		);

		expect(collectTreeIds(tree).sort()).toEqual(['A', 'B', 'o1']);
		expect(tree.children[0].children.map((c) => c.id)).toEqual(['o1']);
	});

	it('stops expanding at maxDepth', () => {
		const chain: Record<string, ClusterStatementLike> = {};
		for (let i = 0; i < 10; i++)
			chain[`n${i}`] = { isCluster: true, integratedOptions: [`n${i + 1}`] };
		const tree = buildClusterTree('n0', lookup(chain), { maxDepth: 3 });

		expect(collectTreeIds(tree)).toEqual(['n0', 'n1', 'n2', 'n3']);
	});

	it('defaults to a cap of 6 levels', () => {
		const chain: Record<string, ClusterStatementLike> = {};
		for (let i = 0; i < 12; i++)
			chain[`n${i}`] = { isCluster: true, integratedOptions: [`n${i + 1}`] };

		expect(collectTreeIds(buildClusterTree('n0', lookup(chain)))).toHaveLength(7);
	});
});

describe('computeEffectiveTreeVote', () => {
	const tree = buildClusterTree('T', lookup(THEME_DOCS));

	it('theme -> synthesis -> options: option votes reach the theme', () => {
		expect(computeEffectiveTreeVote(tree, votesOf({ o1: 1, o2: 0 }))).toBeCloseTo(0.5);
	});

	it('returns null for a user who did not take part in the subtree', () => {
		expect(computeEffectiveTreeVote(tree, votesOf({ elsewhere: 1 }))).toBeNull();
		expect(computeEffectiveTreeVote(tree, votesOf({}))).toBeNull();
	});

	it('a direct vote on the synthesis outranks that user votes on its members', () => {
		const s1 = tree.children[0];
		expect(computeEffectiveTreeVote(s1, votesOf({ S1: 1, o1: -1, o2: -1 }))).toBe(1);
	});

	it('at the theme that user contributes one value: S1 direct averaged with other members', () => {
		// S1 -> 1 (direct), S2 -> avg(o3) = 0.5, o5 -> not voted. Theme = (1 + 0.5) / 2.
		const value = computeEffectiveTreeVote(tree, votesOf({ S1: 1, o1: -1, o2: -1, o3: 0.5 }));

		expect(value).toBeCloseTo(0.75);
	});

	it('a theme whose members are ALL syntheses averages one value per synthesis', () => {
		const allSynth = buildClusterTree(
			'T',
			lookup({ ...THEME_DOCS, T: { isCluster: true, integratedOptions: ['S1', 'S2'] } }),
		);

		// S1 = avg(o1, o2) = 1; S2 = o3 = -1; theme = (1 + -1) / 2 = 0.
		expect(computeEffectiveTreeVote(allSynth, votesOf({ o1: 1, o2: 1, o3: -1 }))).toBeCloseTo(0);
		// Only one synthesis voted: the other is skipped, not counted as zero.
		expect(computeEffectiveTreeVote(allSynth, votesOf({ o3: -1 }))).toBe(-1);
	});

	it('a direct vote on the theme wins over everything below', () => {
		expect(computeEffectiveTreeVote(tree, votesOf({ T: -1, S1: 1, o1: 1, o5: 1 }))).toBe(-1);
	});

	it('absorbed-cluster votes beat the member average, at any level', () => {
		const withAbsorbed: ClusterNode = {
			id: 'T',
			absorbedClusterIds: ['old1', 'old2'],
			children: [
				{
					id: 'S1',
					absorbedClusterIds: ['oldS'],
					children: [{ id: 'o1', absorbedClusterIds: [], children: [] }],
				},
			],
		};

		expect(
			computeEffectiveTreeVote(withAbsorbed, votesOf({ old1: 1, old2: 0, o1: -1 })),
		).toBeCloseTo(0.5);
		expect(computeEffectiveTreeVote(withAbsorbed, votesOf({ oldS: 1, o1: -1 }))).toBe(1);
	});
});

describe('one-level parity with computeEffectiveClusterVote', () => {
	// The unified-rule fixtures from clusterVoteUnified.test.ts plus edge cases.
	const cases: Array<{ name: string; absorbed: string[]; votes: Votes }> = [
		{ name: 'direct + members', absorbed: [], votes: { c: 1, m1: -1, m2: -1 } },
		{ name: 'members only', absorbed: [], votes: { m1: 1, m2: 0 } },
		{ name: 'one member', absorbed: [], votes: { m1: -0.5 } },
		{ name: 'absorbed beats members', absorbed: ['a1', 'a2'], votes: { a1: 1, a2: 0, m1: -1 } },
		{ name: 'direct beats absorbed', absorbed: ['a1'], votes: { c: -1, a1: 1, m1: 1 } },
		{ name: 'absorbed only', absorbed: ['a1'], votes: { a1: 0.25 } },
		{ name: 'no votes', absorbed: [], votes: {} },
	];

	it.each(cases)('$name', ({ absorbed, votes }) => {
		const userEvals = Object.entries(votes).map(([id, v]) => evalOf('u', id, v));
		const memberIds = ['m1', 'm2'];

		const viaRule = computeEffectiveClusterVote('c', userEvals, absorbed);
		const viaTree = computeEffectiveTreeVote(
			flatClusterTree('c', absorbed, memberIds),
			votesOf(votes),
		);

		expect(viaTree).toEqual(viaRule);
	});

	it('the aggregator gives the same totals with a one-level tree as without one', () => {
		const evals = [
			evalOf('A', 'c', 1),
			evalOf('A', 'm1', -1),
			evalOf('B', 'm1', 1),
			evalOf('B', 'm2', 0),
			evalOf('C', 'a1', -0.5),
		];
		const flat = computeClusterEvaluationFromRawEvals(evals, {
			clusterStatementId: 'c',
			absorbedClusterIds: ['a1'],
		}).evaluation;
		const treed = computeClusterEvaluationFromRawEvals(evals, {
			clusterTree: flatClusterTree('c', ['a1'], ['m1', 'm2']),
		}).evaluation;

		expect(treed.numberOfEvaluators).toBe(flat.numberOfEvaluators);
		expect(treed.sumEvaluations).toBeCloseTo(flat.sumEvaluations);
		expect(treed.agreement).toBeCloseTo(flat.agreement);
	});
});

describe('computeClusterEvaluationFromRawEvals with a nested tree', () => {
	const tree = buildClusterTree('T', lookup(THEME_DOCS));
	const evals = [
		evalOf('A', 'S1', 1),
		evalOf('A', 'o1', -1),
		evalOf('A', 'o3', 0.5),
		evalOf('B', 'o1', 1),
		evalOf('B', 'o2', 0),
		evalOf('C', 'o3', -1),
		evalOf('C', 'o5', 1),
		evalOf('D', 'o4', 0.5),
	];

	function evaluators(root: string): number {
		const subtree = buildClusterTree(root, lookup(THEME_DOCS));

		return computeClusterEvaluationFromRawEvals(
			evals.filter((e) => collectTreeIds(subtree).includes(e.statementId)),
			{ clusterTree: subtree },
		).evaluation.numberOfEvaluators;
	}

	it('counts votes on options inside a synthesis at the theme', () => {
		const { evaluation } = computeClusterEvaluationFromRawEvals(evals, { clusterTree: tree });

		// A: (1 + 0.5)/2 = 0.75 | B: S1 = 0.5 | C: (-1 + 1)/2 = 0 | D: S2 = 0.5
		expect(evaluation.numberOfEvaluators).toBe(4);
		expect(evaluation.sumEvaluations).toBeCloseTo(0.75 + 0.5 + 0 + 0.5);
	});

	it('theme numberOfEvaluators is >= that of every member (acceptance invariant)', () => {
		const theme = evaluators('T');

		for (const memberId of ['S1', 'S2', 'o1', 'o2', 'o3', 'o4', 'o5']) {
			expect(theme).toBeGreaterThanOrEqual(evaluators(memberId));
		}
		expect(evaluators('S1')).toBe(2);
		expect(evaluators('S2')).toBe(3);
		expect(theme).toBe(4);
	});
});
