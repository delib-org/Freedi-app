jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

// Block out the firebase-admin Firestore client + the demographic-evaluation
// helper so this stays a pure unit test of the math + queue contract.
const mockGetFirestore = jest.fn();
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => mockGetFirestore(),
}));

const mockUpdateUserDemographicEvaluation = jest.fn();
jest.mock('../../../fn_polarizationIndex', () => ({
	updateUserDemographicEvaluation: (...args: unknown[]) =>
		mockUpdateUserDemographicEvaluation(...args),
}));

const mockRecomputeClusterEvaluation = jest.fn();
const mockFetchEvaluationsForIds = jest.fn();
jest.mock('../../../condensation/aggregation', () => ({
	computeClusterEvaluationFromRawEvals: jest.requireActual('../../../condensation/aggregation')
		.computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds: (...args: unknown[]) => mockFetchEvaluationsForIds(...args),
	recomputeClusterEvaluation: (...args: unknown[]) => mockRecomputeClusterEvaluation(...args),
}));

import {
	computeEffectiveVote,
	debugAggregatePreview,
	enqueueClusterRecompute,
	findClustersContainingMember,
	recomputeSynthCluster,
} from '../clusterRecompute';
import type { Evaluation } from '@freedi/shared-types';

function evalRec(opts: {
	evaluatorId: string;
	statementId: string;
	value: number;
	demographicAnchorId?: string;
	updatedAt?: number;
}): Evaluation {
	return {
		evaluationId: `${opts.evaluatorId}-${opts.statementId}`,
		evaluatorId: opts.evaluatorId,
		statementId: opts.statementId,
		parentId: 'parent',
		topParentId: 'parent',
		evaluation: opts.value,
		updatedAt: opts.updatedAt ?? 0,
		createdAt: 0,
		demographicAnchorId: opts.demographicAnchorId,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

beforeEach(() => {
	mockGetFirestore.mockReset();
	mockUpdateUserDemographicEvaluation.mockReset();
	mockRecomputeClusterEvaluation.mockReset();
	mockFetchEvaluationsForIds.mockReset();
});

describe('computeEffectiveVote (live-synth direct-wins rule)', () => {
	it('returns the direct vote when the user voted directly on the cluster', () => {
		const evals: Evaluation[] = [
			evalRec({ evaluatorId: 'A', statementId: 'X1', value: -1 }),
			evalRec({ evaluatorId: 'A', statementId: 'cluster1', value: 0.7 }),
			evalRec({ evaluatorId: 'A', statementId: 'X2', value: 1 }),
		];
		expect(computeEffectiveVote('cluster1', evals)).toBeCloseTo(0.7);
	});

	it('returns the average of member votes when no direct vote exists', () => {
		const evals: Evaluation[] = [
			evalRec({ evaluatorId: 'A', statementId: 'X1', value: 1 }),
			evalRec({ evaluatorId: 'A', statementId: 'X2', value: 0 }),
		];
		expect(computeEffectiveVote('cluster1', evals)).toBeCloseTo(0.5);
	});

	it('returns null when the user has no relevant evaluations', () => {
		expect(computeEffectiveVote('cluster1', [])).toBeNull();
	});
});

describe('debugAggregatePreview', () => {
	it('matches computeClusterEvaluationFromRawEvals with directVoteWins=true', () => {
		const evals: Evaluation[] = [
			evalRec({ evaluatorId: 'A', statementId: 'cluster1', value: 1 }),
			evalRec({ evaluatorId: 'A', statementId: 'X1', value: -1 }),
			evalRec({ evaluatorId: 'B', statementId: 'X1', value: 1 }),
			evalRec({ evaluatorId: 'B', statementId: 'X2', value: 0 }),
		];
		const preview = debugAggregatePreview('cluster1', evals);
		// A counts once via direct vote (+1); B counts once via member avg ((1+0)/2 = 0.5)
		// numberOfEvaluators = 2; sumEvaluations = 1 + 0.5 = 1.5
		expect(preview.numberOfEvaluators).toBe(2);
		expect(preview.sumEvaluations).toBeCloseTo(1.5);
	});
});

describe('enqueueClusterRecompute', () => {
	it('writes a queue doc using the clusterId as the doc id (idempotent merge)', async () => {
		const setMock = jest.fn().mockResolvedValue(undefined);
		const docMock = jest.fn().mockReturnValue({ set: setMock });
		const collMock = jest.fn().mockReturnValue({ doc: docMock });
		mockGetFirestore.mockReturnValue({ collection: collMock });

		await enqueueClusterRecompute('cluster1', 'evaluation:create', 'user1');

		expect(collMock).toHaveBeenCalledWith('_clusterRecomputeQueue');
		expect(docMock).toHaveBeenCalledWith('cluster1');
		expect(setMock).toHaveBeenCalledTimes(1);
		const [payload, opts] = setMock.mock.calls[0];
		expect(payload).toMatchObject({
			clusterId: 'cluster1',
			reason: 'evaluation:create',
			lastEvaluatorId: 'user1',
		});
		expect(typeof payload.pendingRecomputeAt).toBe('number');
		expect(opts).toEqual({ merge: true });
	});

	it('is fail-open: a write failure logs and resolves without throwing', async () => {
		mockGetFirestore.mockImplementation(() => {
			throw new Error('firestore down');
		});
		await expect(enqueueClusterRecompute('cluster1', 'evaluation:create')).resolves.toBeUndefined();
	});

	it('skips when clusterId is empty', async () => {
		const collMock = jest.fn();
		mockGetFirestore.mockReturnValue({ collection: collMock });
		await enqueueClusterRecompute('', 'evaluation:create');
		expect(collMock).not.toHaveBeenCalled();
	});
});

describe('findClustersContainingMember', () => {
	it('queries statements where integratedOptions array-contains the member id', async () => {
		const docs = [
			{ data: () => ({ statementId: 'cluster1', integratedOptions: ['X1', 'X2'] }) },
			{ data: () => ({ statementId: 'cluster2', integratedOptions: ['X1', 'X3'] }) },
		];
		const getMock = jest.fn().mockResolvedValue({ docs });
		const whereMock = jest.fn().mockReturnValue({ get: getMock });
		const collMock = jest.fn().mockReturnValue({ where: whereMock });
		mockGetFirestore.mockReturnValue({ collection: collMock });

		const clusters = await findClustersContainingMember('X1');

		expect(whereMock).toHaveBeenCalledWith('integratedOptions', 'array-contains', 'X1');
		expect(clusters).toHaveLength(2);
		expect(clusters.map((c) => c.statementId)).toEqual(['cluster1', 'cluster2']);
	});

	it('returns empty array on Firestore failure (does not throw)', async () => {
		const collMock = jest.fn().mockImplementation(() => {
			throw new Error('boom');
		});
		mockGetFirestore.mockReturnValue({ collection: collMock });
		const clusters = await findClustersContainingMember('X1');
		expect(clusters).toEqual([]);
	});

	it('returns empty array when no member id provided', async () => {
		const collMock = jest.fn();
		mockGetFirestore.mockReturnValue({ collection: collMock });
		expect(await findClustersContainingMember('')).toEqual([]);
		expect(collMock).not.toHaveBeenCalled();
	});
});

describe('recomputeSynthCluster', () => {
	it('returns updated=false when the cluster doc does not exist', async () => {
		const getMock = jest.fn().mockResolvedValue({ exists: false });
		const docMock = jest.fn().mockReturnValue({ get: getMock });
		const collMock = jest.fn().mockReturnValue({ doc: docMock });
		mockGetFirestore.mockReturnValue({ collection: collMock });

		const result = await recomputeSynthCluster('missing');

		expect(result).toEqual({
			clusterId: 'missing',
			updated: false,
			evaluatorCount: 0,
			consensus: 0,
		});
		expect(mockRecomputeClusterEvaluation).not.toHaveBeenCalled();
		expect(mockFetchEvaluationsForIds).not.toHaveBeenCalled();
	});

	it('returns updated=false when the doc has no integratedOptions', async () => {
		const getMock = jest.fn().mockResolvedValue({
			exists: true,
			data: () => ({ statementId: 'X1', integratedOptions: [] }),
		});
		const docMock = jest.fn().mockReturnValue({ get: getMock, update: jest.fn() });
		const collMock = jest.fn().mockReturnValue({ doc: docMock });
		mockGetFirestore.mockReturnValue({ collection: collMock });

		const result = await recomputeSynthCluster('X1');

		expect(result.updated).toBe(false);
		expect(mockRecomputeClusterEvaluation).not.toHaveBeenCalled();
	});

	it('recomputes cluster evaluation and per-evaluator polarization with effective votes', async () => {
		const updateMock = jest.fn().mockResolvedValue(undefined);
		const getMock = jest.fn().mockResolvedValue({
			exists: true,
			data: () => ({
				statementId: 'cluster1',
				integratedOptions: ['X1', 'X2'],
				isCluster: true,
			}),
		});
		const docMock = jest.fn().mockReturnValue({ get: getMock, update: updateMock });
		const collMock = jest.fn().mockReturnValue({ doc: docMock });
		mockGetFirestore.mockReturnValue({ collection: collMock });

		mockRecomputeClusterEvaluation.mockResolvedValue({
			agreement: 0.42,
			numberOfEvaluators: 2,
			// other fields elided for brevity
		});
		// User A: direct vote on cluster (+1) wins over member -1
		// User B: no direct vote, member-avg = 0.5
		mockFetchEvaluationsForIds.mockResolvedValue([
			evalRec({
				evaluatorId: 'A',
				statementId: 'cluster1',
				value: 1,
				demographicAnchorId: 'anchor1',
				updatedAt: 200,
			}),
			evalRec({
				evaluatorId: 'A',
				statementId: 'X1',
				value: -1,
				demographicAnchorId: 'anchor0',
				updatedAt: 100,
			}),
			evalRec({ evaluatorId: 'B', statementId: 'X1', value: 1 }),
			evalRec({ evaluatorId: 'B', statementId: 'X2', value: 0 }),
		]);

		const result = await recomputeSynthCluster('cluster1');

		expect(mockRecomputeClusterEvaluation).toHaveBeenCalledWith('cluster1', {
			directVoteWins: true,
			clusterStatementId: 'cluster1',
		});
		expect(mockFetchEvaluationsForIds).toHaveBeenCalledWith(['cluster1', 'X1', 'X2']);
		// Two distinct evaluators contributed
		expect(result.evaluatorCount).toBe(2);
		expect(result.updated).toBe(true);
		expect(result.consensus).toBeCloseTo(0.42);

		// A's call uses the direct vote (+1) AND the most-recent demographicAnchorId
		// (anchor1, updatedAt=200 beats anchor0/100).
		const userACalls = mockUpdateUserDemographicEvaluation.mock.calls.filter(
			(c) => c[1]?.userId === 'A',
		);
		expect(userACalls).toHaveLength(1);
		expect(userACalls[0][1]).toMatchObject({
			userId: 'A',
			evaluation: 1,
			demographicAnchorId: 'anchor1',
		});

		// B's call uses the member-vote average (0.5)
		const userBCalls = mockUpdateUserDemographicEvaluation.mock.calls.filter(
			(c) => c[1]?.userId === 'B',
		);
		expect(userBCalls).toHaveLength(1);
		expect(userBCalls[0][1].evaluation).toBeCloseTo(0.5);
	});

	it('continues if a per-evaluator polarization update fails', async () => {
		const getMock = jest.fn().mockResolvedValue({
			exists: true,
			data: () => ({
				statementId: 'cluster1',
				integratedOptions: ['X1'],
				isCluster: true,
			}),
		});
		const docMock = jest.fn().mockReturnValue({
			get: getMock,
			update: jest.fn().mockResolvedValue(undefined),
		});
		const collMock = jest.fn().mockReturnValue({ doc: docMock });
		mockGetFirestore.mockReturnValue({ collection: collMock });

		mockRecomputeClusterEvaluation.mockResolvedValue({
			agreement: 0,
			numberOfEvaluators: 2,
		});
		mockFetchEvaluationsForIds.mockResolvedValue([
			evalRec({ evaluatorId: 'A', statementId: 'X1', value: 1 }),
			evalRec({ evaluatorId: 'B', statementId: 'X1', value: -1 }),
		]);
		// First evaluator throws; second should still run.
		mockUpdateUserDemographicEvaluation
			.mockRejectedValueOnce(new Error('first user blew up'))
			.mockResolvedValueOnce(undefined);

		const result = await recomputeSynthCluster('cluster1');

		// Despite the failure, we still report the evaluator that succeeded as
		// counted (the failure is per-user; the cluster aggregate succeeded).
		expect(mockUpdateUserDemographicEvaluation).toHaveBeenCalledTimes(2);
		expect(result.evaluatorCount).toBe(2);
	});
});
