import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockRecord = jest.fn<(parentId?: string, userId?: string) => Promise<boolean>>();
const mockRefreshResults = jest.fn<(parentId?: string) => Promise<void>>();
const mockUpdateStatement = jest.fn<() => Promise<unknown>>();

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../evaluatorParticipation', () => ({
	recordEvaluatorParticipation: (parentId?: string, userId?: string) =>
		mockRecord(parentId, userId),
}));
jest.mock('../updateChosenOptions', () => ({
	updateParentStatementWithChosenOptions: (parentId?: string) => mockRefreshResults(parentId),
}));
jest.mock('../statementEvaluationUpdater', () => ({
	updateStatementEvaluation: () => mockUpdateStatement(),
}));
jest.mock('../../fn_polarizationIndex', () => ({ updateUserDemographicEvaluation: jest.fn() }));
jest.mock('../../engagement/credits/trackEngagement', () => ({
	trackEvaluationEngagement: () => Promise.resolve(),
}));
jest.mock('../../engagement/notifications/socialProofTrigger', () => ({
	checkSocialProofMilestone: () => Promise.resolve(),
}));
jest.mock('../../fn_adminStats', () => ({ onEvaluationCreatedStats: () => Promise.resolve() }));
jest.mock('../../services/hybrid-vector-service', () => ({
	markHybridEmbeddingStale: () => Promise.resolve(),
}));
jest.mock('../../statements/history/writeHistoryEntry', () => ({
	writeHistoryEntry: () => Promise.resolve(),
}));
jest.mock('../../statements/history/isResearchEnabled', () => ({
	isResearchEnabledForTopParent: () => Promise.resolve(false),
}));
jest.mock('../../progress/questionProgressWriter', () => ({
	recordParticipation: () => Promise.resolve(),
}));
jest.mock('../../synthesis/featureFlags', () => ({
	synthesisFlags: { clusterAwarePolarization: false },
}));
jest.mock('../../synthesis/liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: jest.fn(),
	findClustersContainingMember: jest.fn(),
	findClustersAffectedByVote: jest.fn(),
}));

import { newEvaluation } from '../onCreateEvaluation';
import { updateEvaluation } from '../onUpdateEvaluation';
import { deleteEvaluation } from '../onDeleteEvaluation';

const statement = { statementId: 'opt1', parentId: 'q1', topParentId: 'top' };

function evaluationData(value: number, uid = 'alice'): Record<string, unknown> {
	return { statementId: 'opt1', parentId: 'q1', evaluation: value, evaluator: { uid } };
}

const createEvent = (value: number): never =>
	({ id: 'ev-1', data: { id: 'd1', data: () => evaluationData(value) } }) as never;

describe('evaluation triggers and the evaluator count', () => {
	beforeEach(() => {
		mockRecord.mockReset().mockResolvedValue(true);
		mockRefreshResults.mockReset().mockResolvedValue(undefined);
		mockUpdateStatement.mockReset().mockResolvedValue({ statement, duplicate: false });
	});

	it('create: a first evaluation is counted', async () => {
		await newEvaluation(createEvent(1));

		expect(mockRecord).toHaveBeenCalledWith('q1', 'alice');
		expect(mockRefreshResults).toHaveBeenCalledWith('q1');
	});

	it('create: a neutral evaluation (value 0) still counts as participation', async () => {
		await newEvaluation(createEvent(0));

		expect(mockRecord).toHaveBeenCalledWith('q1', 'alice');
	});

	it('create: a duplicate delivery of the event does no counting or refresh work', async () => {
		mockUpdateStatement.mockResolvedValue({ statement, duplicate: true });

		await newEvaluation(createEvent(1));

		expect(mockRecord).not.toHaveBeenCalled();
		expect(mockRefreshResults).not.toHaveBeenCalled();
	});

	it('update: records participation (idempotent safety net) and refreshes results', async () => {
		await updateEvaluation({
			id: 'ev-2',
			data: {
				before: { data: () => evaluationData(1), id: 'd1' },
				after: { data: () => evaluationData(-1), id: 'd1' },
			},
		} as never);

		expect(mockRecord).toHaveBeenCalledWith('q1', 'alice');
		expect(mockRefreshResults).toHaveBeenCalledWith('q1');
	});

	it('delete: never decrements - it does not touch the count, only refreshes results', async () => {
		await deleteEvaluation({
			id: 'ev-3',
			data: { id: 'd1', data: () => evaluationData(1) },
		} as never);

		expect(mockRecord).not.toHaveBeenCalled();
		expect(mockRefreshResults).toHaveBeenCalledWith('q1');
	});
});
