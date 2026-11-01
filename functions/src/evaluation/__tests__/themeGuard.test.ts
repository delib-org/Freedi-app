import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGet = jest.fn<() => Promise<{ data: () => unknown }>>();
const mockDelete = jest.fn<() => Promise<void>>();

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../index', () => ({
	db: { collection: () => ({ doc: () => ({ get: () => mockGet() }) }) },
}));

import { dropEvaluationOnTheme } from '../themeGuard';

const snapshot = { id: 'u1--t1', ref: { delete: () => mockDelete() } } as never;

const target = (data: unknown): void => {
	mockGet.mockResolvedValue({ data: () => data });
};

describe('dropEvaluationOnTheme', () => {
	beforeEach(() => {
		mockGet.mockReset();
		mockDelete.mockReset().mockResolvedValue(undefined);
	});

	it('deletes the evaluation and stops for a topic-cluster theme', async () => {
		target({ isCluster: true, derivedByPipeline: 'topic-cluster' });

		await expect(dropEvaluationOnTheme(snapshot, 't1', 'ev-1')).resolves.toBe(true);
		expect(mockDelete).toHaveBeenCalledTimes(1);
	});

	it('keeps a manual merge (cluster without derivedByPipeline) votable', async () => {
		target({ isCluster: true });

		await expect(dropEvaluationOnTheme(snapshot, 't1', 'ev-1')).resolves.toBe(false);
		expect(mockDelete).not.toHaveBeenCalled();
	});

	it('lets a synthesis through untouched', async () => {
		target({ isCluster: true, derivedByPipeline: 'synthesis' });

		await expect(dropEvaluationOnTheme(snapshot, 't1', 'ev-1')).resolves.toBe(false);
		expect(mockDelete).not.toHaveBeenCalled();
	});

	it('lets a plain option or a missing statement through', async () => {
		target({ statementType: 'option' });
		await expect(dropEvaluationOnTheme(snapshot, 't1', 'ev-1')).resolves.toBe(false);

		target(undefined);
		await expect(dropEvaluationOnTheme(snapshot, 't1', 'ev-1')).resolves.toBe(false);
		expect(mockDelete).not.toHaveBeenCalled();
	});
});
