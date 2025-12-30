import { StatementService } from '../statementService';
import { db } from '../../../db';
import * as arrayUtils from '../../../utils/arrayUtils';
import { StatementType, Statement } from '@freedi/shared-types';

// Mock Firebase Admin
jest.mock('../../../db', () => ({
	db: {
		collection: jest.fn(),
		batch: jest.fn(),
	},
}));

// Mock array utils
jest.mock('../../../utils/arrayUtils', () => ({
	shuffleArray: jest.fn((arr) => [...arr].reverse()),
	getRandomSample: jest.fn((arr, size) => arr.slice(0, size)),
}));

describe('StatementService', () => {
	let statementService: StatementService;
	let mockCollection: Record<string, jest.Mock>;
	let mockQuery: Record<string, jest.Mock>;
	let mockBatch: Record<string, jest.Mock>;

	beforeEach(() => {
		statementService = new StatementService();

		// Reset all mocks
		jest.clearAllMocks();

		// Setup mock collection
		mockQuery = {
			where: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			limit: jest.fn().mockReturnThis(),
			get: jest.fn(),
		};

		mockCollection = {
			where: jest.fn().mockReturnValue(mockQuery),
			doc: jest.fn(),
		};

		mockBatch = {
			update: jest.fn(),
			commit: jest.fn().mockResolvedValue(undefined),
		};

		(db.collection as jest.Mock).mockReturnValue(mockCollection);
		(db.batch as jest.Mock).mockReturnValue(mockBatch);
	});

	describe('getUserOptions', () => {
		it('should fetch user options with correct filters', async () => {
			// Arrange
			const mockDocs = [
				{ data: () => ({ statementId: '1', statement: 'Option 1' }) },
				{ data: () => ({ statementId: '2', statement: 'Option 2' }) },
			];
			mockQuery.get.mockResolvedValue({ docs: mockDocs });

			// Act
			const result = await statementService.getUserOptions({
				userId: 'user123',
				parentId: 'parent123',
			});

			// Assert
			expect(mockCollection.where).toHaveBeenCalledWith('creatorId', '==', 'user123');
			expect(mockQuery.where).toHaveBeenCalledWith('parentId', '==', 'parent123');
			expect(mockQuery.where).toHaveBeenCalledWith('statementType', 'in', ['result', 'option']);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ statementId: '1', statement: 'Option 1' });
		});

		it('should return empty array when no options found', async () => {
			// Arrange
			mockQuery.get.mockResolvedValue({ docs: [] });

			// Act
			const result = await statementService.getUserOptions({
				userId: 'user123',
				parentId: 'parent123',
			});

			// Assert
			expect(result).toEqual([]);
		});
	});

	describe('getRandomStatements', () => {
		it('should return standard random statements when anchored is disabled', async () => {
			// Arrange
			const mockParentDoc = {
				data: () => ({ evaluationSettings: { anchored: { anchored: false } } }),
			};
			const mockStatementDocs = [
				{ data: () => ({ statementId: '1', statement: 'Statement 1' }) },
				{ data: () => ({ statementId: '2', statement: 'Statement 2' }) },
			];

			mockCollection.doc = jest.fn().mockReturnValue({
				get: jest.fn().mockResolvedValue(mockParentDoc),
			});
			mockQuery.get.mockResolvedValue({ docs: mockStatementDocs });

			// Act
			const result = await statementService.getRandomStatements({
				parentId: 'parent123',
				limit: 6,
			});

			// Assert
			expect(result).toHaveLength(2);
			expect(mockQuery.orderBy).toHaveBeenCalledWith('evaluation.viewed', 'asc');
			expect(mockQuery.orderBy).toHaveBeenCalledWith('evaluation.evaluationRandomNumber', 'desc');
			expect(mockQuery.limit).toHaveBeenCalledWith(6);
		});

		it('should return anchored and non-anchored mix when anchored is enabled', async () => {
			// Arrange
			const mockParentDoc = {
				data: () => ({
					evaluationSettings: {
						anchored: {
							anchored: true,
							numberOfAnchoredStatements: 2,
						},
					},
				}),
			};

			const mockAnchoredDocs = [
				{ data: () => ({ statementId: 'a1', statement: 'Anchored 1', anchored: true }) },
				{ data: () => ({ statementId: 'a2', statement: 'Anchored 2', anchored: true }) },
				{ data: () => ({ statementId: 'a3', statement: 'Anchored 3', anchored: true }) },
			];

			const mockNonAnchoredDocs = [
				{ data: () => ({ statementId: 'n1', statement: 'Non-anchored 1', anchored: false }) },
				{ data: () => ({ statementId: 'n2', statement: 'Non-anchored 2', anchored: false }) },
			];

			mockCollection.doc = jest.fn().mockReturnValue({
				get: jest.fn().mockResolvedValue(mockParentDoc),
			});

			// Setup different responses for different queries
			let callCount = 0;
			mockQuery.get.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// First call - anchored statements
					return Promise.resolve({ docs: mockAnchoredDocs });
				} else {
					// Second call - non-anchored statements
					return Promise.resolve({ docs: mockNonAnchoredDocs });
				}
			});

			// Act
			const result = await statementService.getRandomStatements({
				parentId: 'parent123',
				limit: 6,
			});

			// Assert
			expect(arrayUtils.getRandomSample).toHaveBeenCalledWith(
				expect.any(Array),
				2 // numberOfAnchoredStatements
			);
			expect(arrayUtils.shuffleArray).toHaveBeenCalled();
			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});

		it('should cap limit at 50', async () => {
			// Arrange
			const mockParentDoc = {
				data: () => ({ evaluationSettings: {} }),
			};
			mockCollection.doc = jest.fn().mockReturnValue({
				get: jest.fn().mockResolvedValue(mockParentDoc),
			});
			mockQuery.get.mockResolvedValue({ docs: [] });

			// Act
			await statementService.getRandomStatements({
				parentId: 'parent123',
				limit: 100,
			});

			// Assert
			expect(mockQuery.limit).toHaveBeenCalledWith(50);
		});
	});

	describe('updateStatementViewCounts', () => {
		it('should update view counts for all statements', async () => {
			// Arrange
			const statements = [
				{ statementId: '1', evaluation: { viewed: 5 } },
				{ statementId: '2', evaluation: { viewed: 10 } },
				{ statementId: '3', evaluation: undefined },
			];

			const mockDocRef = { id: 'doc1' };
			mockCollection.doc.mockReturnValue(mockDocRef);

			// Act
			await statementService.updateStatementViewCounts(statements as Statement[]);

			// Assert
			expect(mockBatch.update).toHaveBeenCalledTimes(3);
			expect(mockBatch.update).toHaveBeenCalledWith(
				mockDocRef,
				expect.objectContaining({
					'evaluation.viewed': 6,
					'evaluation.evaluationRandomNumber': expect.any(Number),
				})
			);
			expect(mockBatch.update).toHaveBeenCalledWith(
				mockDocRef,
				expect.objectContaining({
					'evaluation.viewed': 11,
				})
			);
			expect(mockBatch.update).toHaveBeenCalledWith(
				mockDocRef,
				expect.objectContaining({
					'evaluation.viewed': 1,
				})
			);
			expect(mockBatch.commit).toHaveBeenCalled();
		});
	});

	describe('getTopStatements', () => {
		it('should fetch top statements ordered by consensus', async () => {
			// Arrange
			const mockDocs = [
				{ data: () => ({ statementId: '1', consensus: 0.9 }) },
				{ data: () => ({ statementId: '2', consensus: 0.8 }) },
			];
			mockQuery.get.mockResolvedValue({ docs: mockDocs });

			// Act
			const result = await statementService.getTopStatements({
				parentId: 'parent123',
				limit: 10,
			});

			// Assert
			expect(mockCollection.where).toHaveBeenCalledWith('parentId', '==', 'parent123');
			expect(mockQuery.where).toHaveBeenCalledWith('statementType', '==', StatementType.option);
			expect(mockQuery.orderBy).toHaveBeenCalledWith('evaluation.averageEvaluation', 'desc');
			expect(mockQuery.limit).toHaveBeenCalledWith(10);
			expect(result).toHaveLength(2);
			expect(result[0].consensus).toBe(0.9);
		});
	});
});