import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockUpdateStatement = jest.fn<() => Promise<unknown>>();
const mockEngagement = jest.fn<() => Promise<void>>();
const mockSocialProof = jest.fn<() => Promise<void>>();
const mockAdminStats = jest.fn<() => Promise<void>>();
const mockProgress = jest.fn<() => Promise<void>>();
const mockRecordParticipant = jest.fn<() => Promise<boolean>>();

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../evaluatorParticipation', () => ({
	recordEvaluatorParticipation: () => mockRecordParticipant(),
}));
jest.mock('../updateChosenOptions', () => ({
	updateParentStatementWithChosenOptions: () => Promise.resolve(),
}));
jest.mock('../statementEvaluationUpdater', () => ({
	updateStatementEvaluation: () => mockUpdateStatement(),
}));
jest.mock('../../fn_polarizationIndex', () => ({ updateUserDemographicEvaluation: jest.fn() }));
jest.mock('../../engagement/credits/trackEngagement', () => ({
	trackEvaluationEngagement: () => mockEngagement(),
}));
jest.mock('../../engagement/notifications/socialProofTrigger', () => ({
	checkSocialProofMilestone: () => mockSocialProof(),
}));
jest.mock('../../fn_adminStats', () => ({ onEvaluationCreatedStats: () => mockAdminStats() }));
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
	recordParticipation: () => mockProgress(),
}));
jest.mock('../../synthesis/featureFlags', () => ({
	synthesisFlags: { clusterAwarePolarization: false },
}));
jest.mock('../../synthesis/liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: jest.fn(),
	findClustersContainingMember: jest.fn(),
}));

import { newEvaluation } from '../onCreateEvaluation';

const statement = { statementId: 'opt1', parentId: 'q1', topParentId: 'top' };

const eventFor = (extra: Record<string, unknown>): never =>
	({
		id: 'ev-1',
		data: {
			id: 'u1--opt1',
			data: () => ({
				statementId: 'opt1',
				parentId: 'q1',
				evaluation: 1,
				evaluator: { uid: 'u1' },
				updatedAt: 1,
				...extra,
			}),
		},
	}) as never;

describe('newEvaluation with a vote restored from a dissolved synthesis', () => {
	beforeEach(() => {
		[mockEngagement, mockSocialProof, mockAdminStats, mockProgress, mockRecordParticipant].forEach(
			(m) => m.mockReset().mockResolvedValue(undefined as never),
		);
		mockUpdateStatement.mockReset().mockResolvedValue({ statement, duplicate: false });
	});

	it('still updates the option counters but triggers no credits, stats or notifications', async () => {
		await newEvaluation(eventFor({ restoredFromClusterId: 'cluster1' }));

		expect(mockUpdateStatement).toHaveBeenCalledTimes(1);
		expect(mockEngagement).not.toHaveBeenCalled();
		expect(mockSocialProof).not.toHaveBeenCalled();
		expect(mockAdminStats).not.toHaveBeenCalled();
		expect(mockProgress).not.toHaveBeenCalled();
	});

	it('an ordinary new vote still triggers them (control)', async () => {
		await newEvaluation(eventFor({}));

		expect(mockEngagement).toHaveBeenCalledTimes(1);
		expect(mockSocialProof).toHaveBeenCalledTimes(1);
		expect(mockAdminStats).toHaveBeenCalledTimes(1);
		expect(mockProgress).toHaveBeenCalledTimes(1);
	});
});
