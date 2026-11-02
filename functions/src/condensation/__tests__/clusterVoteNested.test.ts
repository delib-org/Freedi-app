jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('./helpers/memoryFirestore').firestoreModule,
);
jest.mock('../../fn_polarizationIndex', () => ({
	updateUserDemographicEvaluation: jest.fn(),
}));

import { StatementType, type Evaluation, type Statement } from '@freedi/shared-types';
import { recomputeClusterEvaluation } from '../aggregation';
import { findClustersAffectedByEvaluation } from '../clusterAncestors';
import { recomputeAffectedClusters } from '../recomputeAffectedClusters';
import { recomputeSynthCluster } from '../../synthesis/liveSynth/clusterRecompute';
import { planClusterRecompute } from '../../evaluation/planClusterRecompute';
import { buildQuestionClusterTrees } from '../../evaluation/questionClusterTrees';
import {
	computeMergedStats,
	groupEvaluationsByStatement,
	indexOptions,
	mergedSourceIds,
} from '../../privacyExport/optionStats';
import { listDocs, peekDoc, resetStore, seedDoc } from './helpers/memoryFirestore';

/**
 * Nested themes: theme T -> syntheses S1, S2 (+ plain option o5) -> options.
 * Every writer and reader must give the same numbers for it.
 */
const THEME = 'T';
const QUESTION = 'q1';

function seedEval(evaluatorId: string, statementId: string, evaluation: number): void {
	seedDoc('evaluations', `${evaluatorId}--${statementId}`, {
		evaluationId: `${evaluatorId}--${statementId}`,
		evaluatorId,
		statementId,
		parentId: QUESTION,
		evaluation,
		updatedAt: 1,
	});
}

function seedStatement(id: string, extra: Partial<Statement>): void {
	seedDoc('statements', id, {
		statementId: id,
		parentId: QUESTION,
		statementType: StatementType.option,
		evaluation: { evaluationRandomNumber: 0.5, viewed: 0 },
		...extra,
	} as Partial<Statement>);
}

function seedNested(): void {
	seedStatement(THEME, {
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: ['S1', 'S2', 'o5'],
	});
	// Syntheses are stored as statementType synthesis, outside the bulk recalc's options query.
	seedStatement('S1', {
		isCluster: true,
		derivedByPipeline: 'synthesis',
		statementType: StatementType.synthesis,
		integratedOptions: ['o1', 'o2'],
	});
	seedStatement('S2', {
		isCluster: true,
		derivedByPipeline: 'synthesis',
		statementType: StatementType.synthesis,
		integratedOptions: ['o3', 'o4'],
	});
	for (const id of ['o1', 'o2', 'o3', 'o4', 'o5']) seedStatement(id, {});
	// A: direct on S1 AND on its members; plus o3.  -> S1 = 1, S2 = 0.5, theme = 0.75
	seedEval('A', 'S1', 1);
	seedEval('A', 'o1', -1);
	seedEval('A', 'o2', -1);
	seedEval('A', 'o3', 0.5);
	// B: members of S1 only.                        -> S1 = 0.5, theme = 0.5
	seedEval('B', 'o1', 1);
	seedEval('B', 'o2', 0);
	// C: o3 and the theme's own plain member o5.    -> S2 = -1, theme = 0
	seedEval('C', 'o3', -1);
	seedEval('C', 'o5', 1);
	// D: o4 only.                                   -> S2 = 0.5, theme = 0.5
	seedEval('D', 'o4', 0.5);
}

function stored(id: string): { sum: number; n: number; agreement: number } {
	const doc = peekDoc('statements', id) as Statement;

	return {
		sum: doc.evaluation?.sumEvaluations ?? NaN,
		n: doc.evaluation?.numberOfEvaluators ?? NaN,
		agreement: doc.evaluation?.agreement ?? NaN,
	};
}

const allEvaluations = (): Evaluation[] =>
	listDocs('evaluations').map((d) => d.data as unknown as Evaluation);
const allStatements = (): Statement[] =>
	listDocs('statements').map((d) => d.data as unknown as Statement);

describe('nested theme: one counting method for every writer and reader', () => {
	beforeEach(() => {
		resetStore();
		seedNested();
	});

	it('votes on options inside a synthesis reach the theme; theme counts >= every member', async () => {
		await recomputeClusterEvaluation('S1');
		await recomputeClusterEvaluation('S2');
		await recomputeClusterEvaluation(THEME);

		const theme = stored(THEME);
		expect(theme.n).toBe(4);
		expect(theme.sum).toBeCloseTo(0.75 + 0.5 + 0 + 0.5);
		expect(stored('S1').n).toBe(2);
		expect(stored('S2').n).toBe(3);
		for (const memberId of ['S1', 'S2']) {
			expect(theme.n).toBeGreaterThanOrEqual(stored(memberId).n);
		}
		// At the synthesis, A's direct vote (1) wins over her member votes: 1 + 0.5.
		expect(stored('S1').sum).toBeCloseTo(1 + 0.5);
	});

	it('recomputeClusterEvaluation, planClusterRecompute and computeMergedStats agree', async () => {
		await recomputeClusterEvaluation(THEME);
		const viaRecompute = stored(THEME);

		// The bulk recalc's view: the question's `option` docs and its evaluations.
		const optionsById = new Map(
			allStatements()
				.filter((s) => s.statementType === StatementType.option)
				.map((s) => [s.statementId, s] as const),
		);
		const evalsByStatementId = groupEvaluationsByStatement(allEvaluations());
		const trees = await buildQuestionClusterTrees(
			QUESTION,
			optionsById,
			[THEME],
			evalsByStatementId,
		);
		const theme = optionsById.get(THEME) as Statement;
		const tree = trees.get(THEME);
		if (!tree) throw new Error('missing tree');
		const plan = planClusterRecompute(theme, THEME, tree, evalsByStatementId, undefined);
		const viaPlanner = plan?.payload.evaluation as Statement['evaluation'];

		const merged = computeMergedStats(
			theme,
			groupEvaluationsByStatement(allEvaluations()),
			undefined,
			indexOptions(allStatements()),
		);

		expect(viaRecompute.n).toBe(4);
		expect(viaPlanner?.numberOfEvaluators).toBe(viaRecompute.n);
		expect(viaPlanner?.sumEvaluations).toBeCloseTo(viaRecompute.sum);
		expect(viaPlanner?.agreement).toBeCloseTo(viaRecompute.agreement);
		expect(merged.mergedTotalEvaluators).toBe(viaRecompute.n);
		expect(merged.mergedSumEvaluations).toBeCloseTo(viaRecompute.sum);
		expect(merged.mergedAgreement).toBeCloseTo(viaRecompute.agreement);
	});

	it('mergedSourceIds returns the deep ids so the export fetches their evaluations', () => {
		const ids = mergedSourceIds(allStatements());

		for (const id of ['T', 'S1', 'S2', 'o1', 'o2', 'o3', 'o4', 'o5']) {
			expect(ids.has(id)).toBe(true);
		}
	});

	it('the live-synth flusher writes the same theme score', async () => {
		await recomputeClusterEvaluation(THEME);
		const viaTrigger = stored(THEME);
		const doc = peekDoc('statements', THEME) as Statement;
		seedDoc('statements', THEME, { ...doc, evaluation: undefined, consensus: 0 });

		await recomputeSynthCluster(THEME);

		expect(stored(THEME)).toEqual(viaTrigger);
	});

	it('a vote on a plain option under a synthesis under a theme recomputes both', async () => {
		expect(new Set(await findClustersAffectedByEvaluation('o1'))).toEqual(new Set(['S1', THEME]));
	});

	it('a vote on a synthesis recomputes the synthesis and the theme above it', async () => {
		expect(new Set(await findClustersAffectedByEvaluation('S2'))).toEqual(new Set(['S2', THEME]));
	});

	it('the trigger path updates the theme when an option inside a synthesis changes', async () => {
		await recomputeAffectedClusters('o1');
		const before = stored(THEME);
		seedEval('E', 'o2', 1);
		await recomputeAffectedClusters('o2');

		expect(stored(THEME).n).toBe(before.n + 1);
		expect(stored('S1').n).toBe(3);
	});

	it('terminates on a cluster cycle', async () => {
		seedStatement('X', { isCluster: true, integratedOptions: ['Y', 'o1'] });
		seedStatement('Y', { isCluster: true, integratedOptions: ['X', 'o2'] });

		await recomputeClusterEvaluation('X');

		expect(stored('X').n).toBe(2);
		expect((await findClustersAffectedByEvaluation('o1')).sort()).toEqual(['S1', 'T', 'X', 'Y']);
	});
});
