jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('./helpers/memoryFirestore').firestoreModule,
);
const mockUpdateUserDemographicEvaluation = jest.fn();
jest.mock('../../fn_polarizationIndex', () => ({
	updateUserDemographicEvaluation: (...args: unknown[]) =>
		mockUpdateUserDemographicEvaluation(...args),
}));

import type { Statement } from '@freedi/shared-types';
import { recomputeClusterEvaluation } from '../aggregation';
import { recomputeAffectedClusters } from '../recomputeAffectedClusters';
import { recomputeSynthCluster } from '../../synthesis/liveSynth/clusterRecompute';
import { peekDoc, resetStore, seedDoc } from './helpers/memoryFirestore';

/**
 * v1: every writer of a cluster score uses ONE counting rule. The two writers
 * that used to disagree are:
 *   - the evaluation trigger  -> recomputeAffectedClusters -> recomputeClusterEvaluation
 *   - the 1-minute flusher    -> recomputeSynthCluster      -> recomputeClusterEvaluation
 */

const CLUSTER = 'cluster1';

function seedEval(evaluatorId: string, statementId: string, evaluation: number): void {
	seedDoc('evaluations', `${evaluatorId}--${statementId}`, {
		evaluationId: `${evaluatorId}--${statementId}`,
		evaluatorId,
		statementId,
		parentId: 'q1',
		evaluation,
		updatedAt: 1,
	});
}

function seedScenario(): void {
	seedDoc('statements', CLUSTER, {
		statementId: CLUSTER,
		parentId: 'q1',
		isCluster: true,
		derivedByPipeline: 'synthesis',
		integratedOptions: ['m1', 'm2'],
		evaluation: { evaluationRandomNumber: 0.5, viewed: 0 },
	} as Partial<Statement>);
	// A: direct +1 AND members (-1, -1)  -> direct wins -> +1
	seedEval('A', CLUSTER, 1);
	seedEval('A', 'm1', -1);
	seedEval('A', 'm2', -1);
	// B: members only (1, 0) -> average 0.5
	seedEval('B', 'm1', 1);
	seedEval('B', 'm2', 0);
	// C: one member only
	seedEval('C', 'm1', -0.5);
}

function storedEvaluation(): { sum: number; n: number; consensus: number } {
	const doc = peekDoc('statements', CLUSTER) as Statement;

	return {
		sum: doc.evaluation?.sumEvaluations ?? NaN,
		n: doc.evaluation?.numberOfEvaluators ?? NaN,
		consensus: doc.consensus ?? NaN,
	};
}

describe('cluster score: one counting method for every writer', () => {
	beforeEach(() => {
		resetStore();
		mockUpdateUserDemographicEvaluation.mockReset();
		seedScenario();
	});

	it('direct vote wins, otherwise member average, each user once', async () => {
		await recomputeClusterEvaluation(CLUSTER);

		const { sum, n } = storedEvaluation();
		expect(n).toBe(3);
		expect(sum).toBeCloseTo(1 + 0.5 - 0.5);
	});

	it('the evaluation trigger and the live-synth flusher write the same numbers', async () => {
		await recomputeAffectedClusters('m1');
		const viaTrigger = storedEvaluation();

		// Scribble over the score, then let the other writer recompute it.
		const doc = peekDoc('statements', CLUSTER) as Statement;
		seedDoc('statements', CLUSTER, { ...doc, evaluation: undefined, consensus: 0 });
		await recomputeSynthCluster(CLUSTER);
		const viaFlusher = storedEvaluation();

		expect(viaFlusher).toEqual(viaTrigger);
		expect(viaTrigger.n).toBe(3);
	});

	it('the trigger path no longer averages a direct vote with member votes', async () => {
		await recomputeAffectedClusters(CLUSTER);

		// Old trigger semantics gave A (1 + -1 + -1) / 3 = -0.33. Direct wins -> +1.
		expect(storedEvaluation().sum).toBeCloseTo(1 + 0.5 - 0.5);
	});

	it('changing a user vote on a member updates the same score from either path', async () => {
		await recomputeClusterEvaluation(CLUSTER);
		seedEval('C', 'm1', 1);
		await recomputeAffectedClusters('m1');

		expect(storedEvaluation().sum).toBeCloseTo(1 + 0.5 + 1);
	});
});
