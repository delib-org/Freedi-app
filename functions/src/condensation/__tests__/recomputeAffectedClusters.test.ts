import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockInfo = jest.fn();
jest.mock('firebase-functions', () => ({
	logger: { info: (...a: unknown[]) => mockInfo(...a) },
}));

const mockLogError = jest.fn();
jest.mock('../../utils/errorHandling', () => ({
	logError: (...a: unknown[]) => mockLogError(...a),
}));

const mockFind = jest.fn<(id: string) => Promise<string[]>>();
const mockRecompute = jest.fn<(id: string) => Promise<null>>();
jest.mock('../aggregation', () => ({
	findClustersAffectedByEvaluation: (id: string) => mockFind(id),
	recomputeClusterEvaluation: (id: string) => mockRecompute(id),
}));

import { recomputeAffectedClusters } from '../recomputeAffectedClusters';

describe('recomputeAffectedClusters', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('skips a deleted cluster (gRPC NOT_FOUND) with an info log and keeps going', async () => {
		mockFind.mockResolvedValue(['gone', 'ok']);
		mockRecompute.mockImplementation(async (id) => {
			if (id === 'gone') {
				throw Object.assign(new Error('5 NOT_FOUND: No document to update'), { code: 5 });
			}

			return null;
		});

		const result = await recomputeAffectedClusters('e1');

		expect(result).toEqual(['ok']);
		expect(mockLogError).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			expect.stringContaining('skipping'),
			expect.objectContaining({ statementId: 'gone' }),
		);
	});

	it('still logs other errors through logError', async () => {
		const failure = new Error('boom');
		mockFind.mockResolvedValue(['broken', 'ok']);
		mockRecompute.mockImplementation(async (id) => {
			if (id === 'broken') throw failure;

			return null;
		});

		const result = await recomputeAffectedClusters('e1');

		expect(result).toEqual(['ok']);
		expect(mockLogError).toHaveBeenCalledTimes(1);
		expect(mockLogError).toHaveBeenCalledWith(
			failure,
			expect.objectContaining({
				operation: 'onEvaluationChangeRecomputeCondensationClusters.recompute',
				statementId: 'broken',
			}),
		);
	});
});
