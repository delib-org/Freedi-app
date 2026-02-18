// Mock Firestore before any imports
const mockDocGet = jest.fn();
const mockDocSet = jest.fn();
const mockDocDelete = jest.fn();
const mockDocUpdate = jest.fn();

const mockDoc = jest.fn(() => ({
	get: mockDocGet,
	set: mockDocSet,
	delete: mockDocDelete,
	update: mockDocUpdate,
}));

const mockCollectionGet = jest.fn();
const mockWhere = jest.fn();
const mockCollection = jest.fn(() => ({
	doc: mockDoc,
	get: mockCollectionGet,
	where: mockWhere,
}));

const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = jest.fn(() => ({
	delete: mockBatchDelete,
	commit: mockBatchCommit,
}));

const mockFirestore = {
	collection: mockCollection,
	batch: mockBatch,
};

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(() => mockFirestore),
	Timestamp: {
		now: jest.fn(() => ({ toMillis: () => Date.now() })),
		fromMillis: jest.fn((ms: number) => ({ toMillis: () => ms })),
	},
	FieldValue: {
		increment: jest.fn((n: number) => ({ _increment: n })),
		delete: jest.fn(() => ({ _delete: true })),
		serverTimestamp: jest.fn(() => ({ _serverTimestamp: true })),
	},
}));

jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

// Import after mocks are set up
import { cache } from '../services/cache-service';

describe('FirestoreCacheService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('get', () => {
		it('should return null if document does not exist', async () => {
			mockDocGet.mockResolvedValue({ exists: false });

			const result = await cache.get('test-key');

			expect(result).toBeNull();
			expect(mockDoc).toHaveBeenCalledWith('test-key');
		});

		it('should return null if cache is expired', async () => {
			const expiredData = {
				value: 'test-value',
				expiresAt: Date.now() - 1000, // Expired 1 second ago
				createdAt: Date.now() - 60000,
				hitCount: 5,
			};

			mockDocGet.mockResolvedValue({
				exists: true,
				data: () => expiredData,
			});

			const result = await cache.get('test-key');

			expect(result).toBeNull();
			expect(mockDocDelete).toHaveBeenCalled();
		});

		// TODO: Fix mock conflict with global jest.setup.ts
		it.skip('should return cached value if not expired', async () => {
			const validData = {
				value: { test: 'data' },
				expiresAt: Date.now() + 60000, // Expires in 1 minute
				createdAt: Date.now() - 30000,
				hitCount: 3,
			};

			mockDocGet.mockResolvedValue({
				exists: true,
				data: () => validData,
			});

			const result = await cache.get('test-key');

			expect(result).toEqual({ test: 'data' });
			expect(mockDocUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					hitCount: 4,
				}),
			);
		});

		it('should handle errors gracefully', async () => {
			mockDocGet.mockRejectedValue(new Error('Firestore error'));

			const result = await cache.get('test-key');

			expect(result).toBeNull();
		});
	});

	describe('set', () => {
		it('should store value with default TTL', async () => {
			const testValue = { test: 'value' };
			mockDocSet.mockResolvedValue(undefined);

			await cache.set('test-key', testValue);

			expect(mockDocSet).toHaveBeenCalledWith(
				expect.objectContaining({
					value: testValue,
					hitCount: 0,
				}),
			);

			const callArg = mockDocSet.mock.calls[0][0];
			expect(callArg.expiresAt).toBeGreaterThan(Date.now());
			expect(callArg.expiresAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
		});

		it('should store value with custom TTL', async () => {
			const testValue = 'cached-data';
			mockDocSet.mockResolvedValue(undefined);

			await cache.set('test-key', testValue, 10);

			const callArg = mockDocSet.mock.calls[0][0];
			expect(callArg.value).toBe(testValue);
			expect(callArg.expiresAt).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);
		});

		it('should handle errors silently', async () => {
			mockDocSet.mockRejectedValue(new Error('Firestore error'));

			// Should not throw
			await expect(cache.set('test-key', 'value')).resolves.not.toThrow();
		});
	});

	describe('generateKey', () => {
		it('should generate deterministic keys', () => {
			const key1 = cache.generateKey('part1', 'part2', 'part3');
			const key2 = cache.generateKey('part1', 'part2', 'part3');

			expect(key1).toBe(key2);
			expect(key1).toMatch(/^cache_[a-z0-9]+$/);
		});

		it('should generate different keys for different inputs', () => {
			const key1 = cache.generateKey('part1', 'part2');
			const key2 = cache.generateKey('part1', 'part3');

			expect(key1).not.toBe(key2);
		});
	});

	describe('delete', () => {
		it('should delete a cache entry', async () => {
			mockDocDelete.mockResolvedValue(undefined);

			await cache.delete('test-key');

			expect(mockDoc).toHaveBeenCalledWith('test-key');
			expect(mockDocDelete).toHaveBeenCalled();
		});

		it('should handle delete errors', async () => {
			mockDocDelete.mockRejectedValue(new Error('Delete error'));

			// Should not throw
			await expect(cache.delete('test-key')).resolves.not.toThrow();
		});
	});

	describe('cleanupExpired', () => {
		it('should delete expired cache entries', async () => {
			const expiredDocs = [{ ref: 'ref1' }, { ref: 'ref2' }];

			mockWhere.mockReturnValue({
				get: jest.fn().mockResolvedValue({
					empty: false,
					docs: expiredDocs,
				}),
			});
			mockBatchCommit.mockResolvedValue(undefined);

			await cache.cleanupExpired();

			expect(mockWhere).toHaveBeenCalledWith('expiresAt', '<', expect.any(Number));
			expect(mockBatchDelete).toHaveBeenCalledTimes(2);
			expect(mockBatchCommit).toHaveBeenCalled();
		});

		it('should handle no expired entries', async () => {
			mockWhere.mockReturnValue({
				get: jest.fn().mockResolvedValue({
					empty: true,
					docs: [],
				}),
			});

			await cache.cleanupExpired();

			expect(mockWhere).toHaveBeenCalled();
		});
	});

	describe('getStats', () => {
		it('should return cache statistics', async () => {
			const now = Date.now();
			const mockDocs = [
				{
					data: () => ({
						expiresAt: now - 1000, // Expired
					}),
				},
				{
					data: () => ({
						expiresAt: now + 1000, // Active
					}),
				},
				{
					data: () => ({
						expiresAt: now + 2000, // Active
					}),
				},
			];

			mockCollectionGet.mockResolvedValue({
				size: 3,
				docs: mockDocs,
			});

			const stats = await cache.getStats();

			expect(stats).toEqual({
				totalEntries: 3,
				expiredEntries: 1,
				activeEntries: 2,
			});
		});

		it('should handle errors in getStats', async () => {
			mockCollectionGet.mockRejectedValue(new Error('Stats error'));

			const stats = await cache.getStats();

			expect(stats).toEqual({
				totalEntries: 0,
				expiredEntries: 0,
				activeEntries: 0,
			});
		});
	});
});
