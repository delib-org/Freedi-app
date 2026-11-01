jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('./helpers/memoryFirestore').firestoreModule,
);
jest.mock('../../synthesis/liveSynth/auditLog', () => ({ recordLiveSynthEvent: jest.fn() }));
jest.mock('../../synthesis/liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: jest.fn(),
}));
const mockGroupEquivalentThemes = jest.fn();
jest.mock('../../services/integration-ai-service', () => ({
	groupEquivalentThemes: (...args: unknown[]) => mockGroupEquivalentThemes(...args),
	generateSynthesizedProposal: jest.fn(),
}));
jest.mock('../../services/embedding-cache-service', () => ({ embeddingCache: {} }));
jest.mock('../../services/verdict-cache-service', () => ({}));
jest.mock('../../services/claim-registry-service', () => ({}));
jest.mock('../../config/openai-chat', () => ({}));

import { StatementType, type Statement } from '@freedi/shared-types';
import { recomputeClusterEvaluation } from '../aggregation';
import { recomputeAffectedClusters } from '../recomputeAffectedClusters';
import { collectAbsorbedIds } from '../absorbedClusters';
import { mergeClusters as pipelineMerge } from '../../synthesis/pipeline/mergeClusters';
import { mergeClusters as claimMerge } from '../../synthesis/consolidation/consolidateClaims';
import { mergeSynths } from '../../synthesis/scheduled/fn_synthesisReJudge';
import { consolidateThemes } from '../../synthesis/pipeline/consolidateThemes';
import { peekDoc, resetStore, seedDoc } from './helpers/memoryFirestore';

/**
 * v2: when cluster B is absorbed into winner A, B's direct votes keep counting
 * for A (one vote per user; A's own direct vote wins over B's, B's wins over
 * member votes). Every join path records B in `A.absorbedClusterIds`.
 */

const Q = 'q1';

function seedCluster(id: string, members: string[], extra: Partial<Statement> = {}): void {
	seedDoc('statements', id, {
		statementId: id,
		parentId: Q,
		statement: id,
		statementType: StatementType.option,
		isCluster: true,
		derivedByPipeline: 'synthesis',
		integratedOptions: members,
		createdAt: 1,
		evaluation: { evaluationRandomNumber: 0.5, viewed: 0 },
		...extra,
	} as Partial<Statement>);
}

function seedEval(evaluatorId: string, statementId: string, evaluation: number): void {
	seedDoc('evaluations', `${evaluatorId}--${statementId}`, {
		evaluationId: `${evaluatorId}--${statementId}`,
		evaluatorId,
		statementId,
		parentId: Q,
		evaluation,
		updatedAt: 1,
	});
}

function stored(id: string): Statement {
	return peekDoc('statements', id) as Statement;
}

/**
 * A = {m1, m2}, B = {m3}.
 *   U1 voted directly on B only (+1)       -> must count for A after the merge
 *   U2 voted on A (+0.5) AND on B (-1)     -> counted once, with A's vote
 *   U3 voted on member m1 only (-0.5)
 */
function seedAandB(): void {
	seedCluster('A', ['m1', 'm2'], { createdAt: 1 });
	seedCluster('B', ['m3'], { createdAt: 2 });
	seedEval('U1', 'B', 1);
	seedEval('U2', 'A', 0.5);
	seedEval('U2', 'B', -1);
	seedEval('U3', 'm1', -0.5);
}

function expectBVotesCarried(): void {
	const a = stored('A');
	expect(a.absorbedClusterIds).toEqual(['B']);
	expect(stored('B').hide).toBe(true);
	expect(a.evaluation?.numberOfEvaluators).toBe(3);
	expect(a.evaluation?.sumEvaluations).toBeCloseTo(1 + 0.5 - 0.5);
}

describe('collectAbsorbedIds', () => {
	it('takes the loser and everything it had absorbed, never the winner itself', () => {
		expect(
			collectAbsorbedIds('A', [
				{ statementId: 'B', absorbedClusterIds: ['C', 'A'] },
				{ statementId: 'D' },
			]).sort(),
		).toEqual(['B', 'C', 'D']);
	});
});

describe('absorbed clusters keep their direct votes', () => {
	beforeEach(() => {
		resetStore();
		mockGroupEquivalentThemes.mockReset();
	});

	it('without the field, B votes are orphaned (baseline)', async () => {
		seedAandB();
		await recomputeClusterEvaluation('A');
		// U2 (direct on A) and U3 (member) only.
		expect(stored('A').evaluation?.numberOfEvaluators).toBe(2);
	});

	it('pipeline mergeClusters carries B direct votes to A', async () => {
		seedAandB();
		await pipelineMerge({ winnerId: 'A', loserId: 'B', reason: 'test' });
		await recomputeClusterEvaluation('A');
		expectBVotesCarried();
	});

	it('reJudge mergeSynths carries donor direct votes to the recipient', async () => {
		seedAandB();
		await mergeSynths(
			{ doc: stored('A'), members: ['m1', 'm2'] },
			{ doc: stored('B'), members: ['m3'] },
			0.9,
		);
		await recomputeClusterEvaluation('A');
		expectBVotesCarried();
		expect(stored('B').mergedInto).toBe('A');
	});

	it('claim consolidation merge carries source direct votes to the target', async () => {
		seedAandB();
		expect(await claimMerge('A', 'B', 'test')).toBe(true);
		await recomputeClusterEvaluation('A');
		expectBVotesCarried();
		expect(stored('B').mergedInto).toBe('A');
	});

	it('theme consolidation carries donor direct votes to the survivor', async () => {
		seedCluster('A', ['m1', 'm2'], { derivedByPipeline: 'topic-cluster', createdAt: 1 });
		seedCluster('B', ['m3'], { derivedByPipeline: 'topic-cluster', createdAt: 2 });
		seedCluster('T3', ['m9'], { derivedByPipeline: 'topic-cluster', createdAt: 3 });
		seedEval('U1', 'B', 1);
		seedEval('U2', 'A', 0.5);
		seedEval('U2', 'B', -1);
		seedEval('U3', 'm1', -0.5);
		mockGroupEquivalentThemes.mockResolvedValue([{ ids: ['A', 'B'], title: 'A+B' }]);

		const result = await consolidateThemes(Q, 'question', 'test');
		expect(result.merges).toBe(1);
		await recomputeClusterEvaluation('A');
		expectBVotesCarried();
	});

	it('chain merge C -> B -> A keeps C and B direct votes, one vote per user', async () => {
		seedCluster('A', ['m1']);
		seedCluster('B', ['m2']);
		seedCluster('C', ['m3']);
		seedEval('U1', 'C', 1); // only on C
		seedEval('U2', 'B', -1); // only on B
		seedEval('U3', 'C', 1); // on C and B: both absorbed, averaged -> 0
		seedEval('U3', 'B', -1);
		seedEval('U4', 'A', 0.2); // own direct beats everything
		seedEval('U4', 'C', -1);
		seedEval('U4', 'm1', -1);

		await pipelineMerge({ winnerId: 'B', loserId: 'C', reason: 'first' });
		await pipelineMerge({ winnerId: 'A', loserId: 'B', reason: 'second' });
		await recomputeClusterEvaluation('A');

		const a = stored('A');
		expect([...(a.absorbedClusterIds ?? [])].sort()).toEqual(['B', 'C']);
		expect(a.evaluation?.numberOfEvaluators).toBe(4);
		expect(a.evaluation?.sumEvaluations).toBeCloseTo(1 - 1 + 0 + 0.2);
	});

	it('a vote change on an absorbed cluster recomputes the winner', async () => {
		seedAandB();
		await pipelineMerge({ winnerId: 'A', loserId: 'B', reason: 'test' });
		seedEval('U1', 'B', -1);

		const recomputed = await recomputeAffectedClusters('B');

		expect(recomputed).toContain('A');
		expect(stored('A').evaluation?.sumEvaluations).toBeCloseTo(-1 + 0.5 - 0.5);
	});
});
