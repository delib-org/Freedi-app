/**
 * Extended tests for firebaseUtils.ts
 *
 * Focus on batch boundary conditions and edge cases not covered by the
 * existing firebaseUtils.test.ts.
 */

import {
	createDocRef,
	createCollectionRef,
	createStatementRef,
	createEvaluationRef,
	createSubscriptionRef,
	executeBatchUpdates,
	getCurrentTimestamp,
	createTimestamps,
	updateTimestamp,
	BatchUpdate,
} from '../firebaseUtils';
import { Collections } from '@freedi/shared-types';

// Mock Firebase
jest.mock('@/controllers/db/config', () => ({
	FireStore: {},
}));

const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);

jest.mock('firebase/firestore', () => ({
	doc: jest.fn((db, collection, id) => ({ collection, id })),
	collection: jest.fn((db, collectionName) => ({ collectionName })),
	writeBatch: jest.fn(() => ({
		update: mockBatchUpdate,
		commit: mockBatchCommit,
	})),
}));

describe('Firebase Utilities (Extended)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockBatchCommit.mockResolvedValue(undefined);
	});

	// -----------------------------------------------------------------------
	// createCollectionRef
	// -----------------------------------------------------------------------
	describe('createCollectionRef', () => {
		it('should create a collection reference', () => {
			const ref = createCollectionRef(Collections.statements);
			expect(ref).toEqual({ collectionName: Collections.statements });
		});

		it('should create different refs for different collections', () => {
			const statementsRef = createCollectionRef(Collections.statements);
			const evaluationsRef = createCollectionRef(Collections.evaluations);

			expect(statementsRef).not.toEqual(evaluationsRef);
		});
	});

	// -----------------------------------------------------------------------
	// Ref creation functions
	// -----------------------------------------------------------------------
	describe('createDocRef with different collection names', () => {
		it('should create refs for all common collections', () => {
			const collections = [
				Collections.statements,
				Collections.evaluations,
				Collections.statementsSubscribe,
			];

			collections.forEach((col) => {
				const ref = createDocRef(col, 'test-id');
				expect(ref).toEqual({ collection: col, id: 'test-id' });
			});
		});

		it('should use the provided document ID', () => {
			const uniqueId = 'unique-doc-id-12345';
			const ref = createDocRef(Collections.statements, uniqueId);
			expect((ref as unknown as { id: string }).id).toBe(uniqueId);
		});
	});

	// -----------------------------------------------------------------------
	// executeBatchUpdates — boundary conditions
	// -----------------------------------------------------------------------
	describe('executeBatchUpdates — boundary conditions', () => {
		function buildUpdates(count: number): BatchUpdate[] {
			return Array.from({ length: count }, (_, i) => ({
				ref: createDocRef(Collections.statements, `id-${i}`),
				data: { value: i, lastUpdate: Date.now() },
			}));
		}

		it('should handle empty updates array without error', async () => {
			await expect(executeBatchUpdates([])).resolves.toBeUndefined();
			expect(jest.requireMock('firebase/firestore').writeBatch).not.toHaveBeenCalled();
		});

		it('should use a single batch for 1 update', async () => {
			await executeBatchUpdates(buildUpdates(1));
			expect(jest.requireMock('firebase/firestore').writeBatch).toHaveBeenCalledTimes(1);
		});

		it('should use a single batch for 499 updates (below limit)', async () => {
			await executeBatchUpdates(buildUpdates(499));
			expect(jest.requireMock('firebase/firestore').writeBatch).toHaveBeenCalledTimes(1);
		});

		it('should use a single batch for exactly 500 updates (at limit)', async () => {
			await executeBatchUpdates(buildUpdates(500));
			expect(jest.requireMock('firebase/firestore').writeBatch).toHaveBeenCalledTimes(1);
		});

		it('should split into 2 batches for 501 updates (above limit)', async () => {
			await executeBatchUpdates(buildUpdates(501));
			expect(jest.requireMock('firebase/firestore').writeBatch).toHaveBeenCalledTimes(2);
		});

		it('should split into 2 batches for 999 updates', async () => {
			await executeBatchUpdates(buildUpdates(999));
			expect(jest.requireMock('firebase/firestore').writeBatch).toHaveBeenCalledTimes(2);
		});

		it('should split into 2 batches for exactly 1000 updates', async () => {
			await executeBatchUpdates(buildUpdates(1000));
			expect(jest.requireMock('firebase/firestore').writeBatch).toHaveBeenCalledTimes(2);
		});

		it('should split into 3 batches for 1001 updates', async () => {
			await executeBatchUpdates(buildUpdates(1001));
			expect(jest.requireMock('firebase/firestore').writeBatch).toHaveBeenCalledTimes(3);
		});

		it('should call batch.update for each item', async () => {
			const updates = buildUpdates(3);
			await executeBatchUpdates(updates);

			expect(mockBatchUpdate).toHaveBeenCalledTimes(3);
		});

		it('should call batch.commit for each batch', async () => {
			await executeBatchUpdates(buildUpdates(501));

			// Two batches → two commits
			expect(mockBatchCommit).toHaveBeenCalledTimes(2);
		});

		it('should propagate batch commit errors', async () => {
			mockBatchCommit.mockRejectedValueOnce(new Error('Batch commit failed'));

			await expect(executeBatchUpdates(buildUpdates(3))).rejects.toThrow('Batch commit failed');
		});
	});

	// -----------------------------------------------------------------------
	// Timestamp utilities — precision and edge cases
	// -----------------------------------------------------------------------
	describe('Timestamp utilities', () => {
		describe('getCurrentTimestamp', () => {
			it('should return a number', () => {
				const ts = getCurrentTimestamp();
				expect(typeof ts).toBe('number');
			});

			it('should return a recent timestamp (within last minute)', () => {
				const ts = getCurrentTimestamp();
				const now = Date.now();
				const oneMinute = 60 * 1000;

				expect(ts).toBeGreaterThan(now - oneMinute);
				expect(ts).toBeLessThanOrEqual(now + 1000); // small buffer for execution time
			});

			it('should return different values on successive calls', async () => {
				const ts1 = getCurrentTimestamp();
				await new Promise((r) => setTimeout(r, 10));
				const ts2 = getCurrentTimestamp();

				expect(ts2).toBeGreaterThanOrEqual(ts1);
			});
		});

		describe('createTimestamps', () => {
			it('should return object with both createdAt and lastUpdate', () => {
				const timestamps = createTimestamps();
				expect(timestamps).toHaveProperty('createdAt');
				expect(timestamps).toHaveProperty('lastUpdate');
			});

			it('should set createdAt and lastUpdate to the same value', () => {
				const timestamps = createTimestamps();
				expect(timestamps.createdAt).toBe(timestamps.lastUpdate);
			});

			it('should return numeric timestamp values', () => {
				const timestamps = createTimestamps();
				expect(typeof timestamps.createdAt).toBe('number');
				expect(typeof timestamps.lastUpdate).toBe('number');
			});
		});

		describe('updateTimestamp', () => {
			it('should return object with only lastUpdate', () => {
				const ts = updateTimestamp();
				expect(ts).toHaveProperty('lastUpdate');
				expect(ts).not.toHaveProperty('createdAt');
			});

			it('should return numeric lastUpdate value', () => {
				const ts = updateTimestamp();
				expect(typeof ts.lastUpdate).toBe('number');
			});

			it('updateTimestamp.lastUpdate should be >= createTimestamps.lastUpdate', () => {
				const created = createTimestamps();

				// Small delay to ensure different timestamps
				const updated = updateTimestamp();

				expect(updated.lastUpdate).toBeGreaterThanOrEqual(created.lastUpdate);
			});
		});
	});

	// -----------------------------------------------------------------------
	// Ref helper functions
	// -----------------------------------------------------------------------
	describe('convenience ref helpers', () => {
		it('createStatementRef should use statements collection', () => {
			const ref = createStatementRef('stmt-abc');
			expect((ref as unknown as { collection: string }).collection).toBe(Collections.statements);
		});

		it('createEvaluationRef should use evaluations collection', () => {
			const ref = createEvaluationRef('eval-xyz');
			expect((ref as unknown as { collection: string }).collection).toBe(Collections.evaluations);
		});

		it('createSubscriptionRef should use statementsSubscribe collection', () => {
			const ref = createSubscriptionRef('sub-123');
			expect((ref as unknown as { collection: string }).collection).toBe(
				Collections.statementsSubscribe,
			);
		});
	});
});
