/**
 * Firebase Utilities Tests
 *
 * Tests for Firebase utility functions.
 */

import {
	createDocRef,
	createStatementRef,
	createEvaluationRef,
	createSubscriptionRef,
	executeBatchUpdates,
	getCurrentTimestamp,
	createTimestamps,
	updateTimestamp,
} from '../firebaseUtils';
import { Collections } from '@freedi/shared-types';

// Mock Firebase
jest.mock('@/controllers/db/config', () => ({
	FireStore: {},
}));

jest.mock('firebase/firestore', () => ({
	doc: jest.fn((db, collection, id) => ({ collection, id })),
	collection: jest.fn((db, collectionName) => ({ collectionName })),
	writeBatch: jest.fn(() => ({
		update: jest.fn(),
		commit: jest.fn().mockResolvedValue(undefined),
	})),
}));

describe('Firebase Utilities', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('createDocRef', () => {
		it('should create a document reference', () => {
			const ref = createDocRef(Collections.statements, 'test-id');

			expect(ref).toEqual({
				collection: Collections.statements,
				id: 'test-id',
			});
		});
	});

	describe('createStatementRef', () => {
		it('should create a statement document reference', () => {
			const ref = createStatementRef('statement-123');

			expect(ref).toEqual({
				collection: Collections.statements,
				id: 'statement-123',
			});
		});
	});

	describe('createEvaluationRef', () => {
		it('should create an evaluation document reference', () => {
			const ref = createEvaluationRef('evaluation-456');

			expect(ref).toEqual({
				collection: Collections.evaluations,
				id: 'evaluation-456',
			});
		});
	});

	describe('createSubscriptionRef', () => {
		it('should create a subscription document reference', () => {
			const ref = createSubscriptionRef('subscription-789');

			expect(ref).toEqual({
				collection: Collections.statementsSubscribe,
				id: 'subscription-789',
			});
		});
	});

	describe('executeBatchUpdates', () => {
		it('should execute batch updates for small batches', async () => {
			const updates = [
				{
					ref: { collection: 'test', id: '1' } as unknown as ReturnType<typeof createDocRef>,
					data: { value: 1 },
				},
				{
					ref: { collection: 'test', id: '2' } as unknown as ReturnType<typeof createDocRef>,
					data: { value: 2 },
				},
			];

			await executeBatchUpdates(updates);

			// Should have created and committed one batch
			const writeBatch = jest.requireMock('firebase/firestore').writeBatch;
			expect(writeBatch).toHaveBeenCalledTimes(1);
		});

		it('should split large batches into multiple operations', async () => {
			// Create 1000 updates (should split into 2 batches of 500)
			const updates = Array.from({ length: 1000 }, (_, i) => ({
				ref: { collection: 'test', id: `${i}` } as unknown as ReturnType<typeof createDocRef>,
				data: { value: i },
			}));

			await executeBatchUpdates(updates);

			// Should have created 2 batches
			const writeBatch = jest.requireMock('firebase/firestore').writeBatch;
			expect(writeBatch).toHaveBeenCalledTimes(2);
		});
	});

	describe('Timestamp utilities', () => {
		beforeEach(() => {
			jest.spyOn(Date, 'now').mockReturnValue(1234567890000);
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		describe('getCurrentTimestamp', () => {
			it('should return current timestamp in milliseconds', () => {
				const timestamp = getCurrentTimestamp();

				expect(timestamp).toBe(1234567890000);
			});
		});

		describe('createTimestamps', () => {
			it('should create timestamps for new documents', () => {
				const timestamps = createTimestamps();

				expect(timestamps).toEqual({
					createdAt: 1234567890000,
					lastUpdate: 1234567890000,
				});
			});
		});

		describe('updateTimestamp', () => {
			it('should create update timestamp', () => {
				const timestamp = updateTimestamp();

				expect(timestamp).toEqual({
					lastUpdate: 1234567890000,
				});
			});
		});
	});
});
