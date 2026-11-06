import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';

const mockInfo = jest.fn();
jest.mock('firebase-functions/v1', () => ({
	logger: { info: (...a: unknown[]) => mockInfo(...a) },
}));

const mockLogError = jest.fn();
jest.mock('../utils/errorHandling', () => ({
	logError: (...a: unknown[]) => mockLogError(...a),
}));

interface FakeParentDoc {
	exists: boolean;
	data: () => Record<string, number>;
}
interface FakeTransaction {
	get: jest.Mock<() => Promise<FakeParentDoc>>;
	update: jest.Mock;
}
const mockTx: FakeTransaction = { get: jest.fn(), update: jest.fn() };
const mockRunTransaction = jest.fn<(fn: (tx: FakeTransaction) => Promise<void>) => Promise<void>>();

jest.mock('../index', () => ({
	db: {
		runTransaction: (fn: (tx: FakeTransaction) => Promise<void>) => mockRunTransaction(fn),
		collection: () => ({ doc: () => ({ id: 'parent' }) }),
	},
}));

import { removeOptionFromMassConsensus } from '../fn_massConsensus';

const event = {
	data: {
		data: () => ({ statementId: 'opt1', parentId: 'q1', statementType: 'option' }),
	},
} as unknown as FirestoreEvent<DocumentSnapshot>;

describe('removeOptionFromMassConsensus', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRunTransaction.mockImplementation((fn) => fn(mockTx));
	});

	it('returns quietly (info, no logError) when the parent is already deleted', async () => {
		mockTx.get.mockResolvedValue({ exists: false, data: () => ({}) });

		await expect(removeOptionFromMassConsensus(event)).resolves.toBeUndefined();

		expect(mockLogError).not.toHaveBeenCalled();
		expect(mockTx.update).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			expect.stringContaining('Parent statement already deleted'),
			expect.objectContaining({ statementId: 'opt1', parentId: 'q1' }),
		);
	});

	it('decrements suggestions when the parent exists', async () => {
		mockTx.get.mockResolvedValue({ exists: true, data: () => ({ suggestions: 3 }) });

		await removeOptionFromMassConsensus(event);

		expect(mockTx.update).toHaveBeenCalledTimes(1);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('still reports real failures through logError', async () => {
		const failure = new Error('transaction aborted');
		mockRunTransaction.mockRejectedValue(failure);

		await removeOptionFromMassConsensus(event);

		expect(mockLogError).toHaveBeenCalledWith(
			failure,
			expect.objectContaining({ operation: 'massConsensus.removeOptionFromMassConsensus' }),
		);
	});
});
