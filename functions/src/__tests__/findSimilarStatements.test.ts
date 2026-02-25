import { Request, Response } from 'firebase-functions/v1';
import { Statement } from '@freedi/shared-types';
import { findSimilarStatements } from '../fn_findSimilarStatements';
import * as aiService from '../services/ai-service';
import * as cachedStatementService from '../services/cached-statement-service';
import * as cachedAiService from '../services/cached-ai-service';
import * as statementService from '../services/statement-service';

// Mock dependencies
jest.mock('../services/ai-service');
jest.mock('../services/cached-statement-service');
jest.mock('../services/cached-ai-service');
jest.mock('../services/statement-service');
jest.mock('../services/vector-search-service', () => ({
	vectorSearchService: {
		findSimilarToText: jest.fn().mockResolvedValue([]),
	},
}));
jest.mock('../services/embedding-cache-service', () => ({
	embeddingCache: {
		getEmbeddingCoverage: jest.fn().mockResolvedValue({ coveragePercent: 0 }),
	},
}));
jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('findSimilarStatements - Optimized', () => {
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;
	let mockSend: jest.Mock;
	let mockStatus: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();

		mockSend = jest.fn();
		mockStatus = jest.fn(() => ({ send: mockSend }));

		mockRequest = {
			body: {
				statementId: 'test-statement-id',
				userInput: 'test user input',
				creatorId: 'test-creator-id',
			},
		};

		mockResponse = {
			status: mockStatus,
			send: mockSend,
		};
	});

	describe('Content moderation', () => {
		it('should reject inappropriate content', async () => {
			jest.spyOn(aiService, 'checkForInappropriateContent').mockResolvedValue({
				isInappropriate: true,
			});

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockSend).toHaveBeenCalledWith({
				ok: false,
				error: 'Input contains inappropriate content',
			});

			// Ensure no further processing happens
			expect(cachedAiService.getCachedSimilarityResponse).not.toHaveBeenCalled();
		});

		it('should never cache inappropriate content checks', async () => {
			const checkSpy = jest.spyOn(aiService, 'checkForInappropriateContent').mockResolvedValue({
				isInappropriate: false,
			});

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			// Content check should always be called fresh, never cached
			expect(checkSpy).toHaveBeenCalledWith('test user input');
			expect(checkSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('Caching behavior', () => {
		beforeEach(() => {
			jest.spyOn(aiService, 'checkForInappropriateContent').mockResolvedValue({
				isInappropriate: false,
			});

			// Parent statement is always fetched first to get threshold
			jest.spyOn(cachedStatementService, 'getCachedParentStatement').mockResolvedValue({
				statement: 'parent question',
				statementSettings: { similarityThreshold: 0.85 },
			} as Partial<Statement> as Statement);
		});

		it('should return cached response when available', async () => {
			const cachedData = {
				similarStatements: [
					{
						statement: 'cached statement',
						statementId: 'cached1',
						creatorId: 'user1',
						creator: { uid: 'user1', displayName: 'Test' },
						statementType: 'option',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
					} as Partial<Statement>,
				] as Statement[],
				userText: 'cached user text',
				generatedTitle: 'cached title',
				generatedDescription: 'cached description',
			};

			jest.spyOn(cachedAiService, 'getCachedSimilarityResponse').mockResolvedValue(
				cachedData as {
					similarStatements: Statement[];
					userText: string;
					generatedTitle?: string;
					generatedDescription?: string;
				},
			);

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			expect(mockStatus).toHaveBeenCalledWith(200);
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					similarStatements: cachedData.similarStatements,
					userText: cachedData.userText,
					ok: true,
					cached: true,
				}),
			);

			// Parent statement IS fetched to get threshold, but sub-statements should not be fetched
			expect(cachedStatementService.getCachedParentStatement).toHaveBeenCalled();
			expect(cachedStatementService.getCachedSubStatements).not.toHaveBeenCalled();
		});

		it('should compute and cache response on cache miss', async () => {
			const mockSubStatements = [
				{ statementId: 'sub1', statement: 'statement 1', creatorId: 'creator1' },
				{ statementId: 'sub2', statement: 'statement 2', creatorId: 'creator2' },
			];

			jest.spyOn(cachedAiService, 'getCachedSimilarityResponse').mockResolvedValue(null);

			jest
				.spyOn(cachedStatementService, 'getCachedSubStatements')
				.mockResolvedValue(mockSubStatements as Partial<Statement>[] as Statement[]);

			jest.spyOn(statementService, 'getUserStatements').mockReturnValue([]);

			jest.spyOn(statementService, 'hasReachedMaxStatements').mockReturnValue(false);

			jest.spyOn(statementService, 'convertToSimpleStatements').mockReturnValue([
				{ id: 'sub1', statement: 'statement 1' },
				{ id: 'sub2', statement: 'statement 2' },
			]);

			// Mock LLM-based similarity search (used when embedding coverage is low)
			jest.spyOn(cachedAiService, 'getCachedSimilarStatementIds').mockResolvedValue(['sub1']);

			jest
				.spyOn(statementService, 'getStatementsByIds')
				.mockReturnValue([mockSubStatements[0]] as Partial<Statement>[] as Statement[]);

			jest.spyOn(statementService, 'removeDuplicateStatement').mockReturnValue({
				statements: [mockSubStatements[0]] as Partial<Statement>[] as Statement[],
				duplicateStatement: undefined,
			});

			// Mock title/description generation
			jest
				.spyOn(aiService, 'generateTitleAndDescription')
				.mockResolvedValue({ title: 'Generated Title', description: 'Generated Description' });

			const saveSpy = jest
				.spyOn(cachedAiService, 'saveCachedSimilarityResponse')
				.mockResolvedValue();

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			// Verify response was saved to cache (now with 5 params including threshold)
			expect(saveSpy).toHaveBeenCalledWith(
				'test-statement-id',
				'test user input',
				'test-creator-id',
				expect.objectContaining({
					userText: 'test user input',
				}),
				0.85, // default threshold
			);

			expect(mockStatus).toHaveBeenCalledWith(200);
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					ok: true,
					userText: 'test user input',
				}),
			);
		});
	});

	describe('Parallel processing', () => {
		beforeEach(() => {
			jest.spyOn(aiService, 'checkForInappropriateContent').mockResolvedValue({
				isInappropriate: false,
			});

			jest.spyOn(cachedAiService, 'getCachedSimilarityResponse').mockResolvedValue(null);
		});

		it('should fetch parent and sub statements in parallel', async () => {
			const parentPromise = Promise.resolve({
				statement: 'parent',
				statementSettings: {},
			});

			const subsPromise = Promise.resolve([]);

			const parentSpy = jest
				.spyOn(cachedStatementService, 'getCachedParentStatement')
				.mockReturnValue(parentPromise as Promise<Statement | null>);

			const subsSpy = jest
				.spyOn(cachedStatementService, 'getCachedSubStatements')
				.mockReturnValue(subsPromise as Promise<Statement[]>);

			jest.spyOn(statementService, 'getUserStatements').mockReturnValue([]);
			jest.spyOn(statementService, 'hasReachedMaxStatements').mockReturnValue(false);
			jest.spyOn(statementService, 'convertToSimpleStatements').mockReturnValue([]);
			jest.spyOn(cachedAiService, 'getCachedSimilarStatementIds').mockResolvedValue([]);
			jest.spyOn(statementService, 'getStatementsByIds').mockReturnValue([]);
			jest.spyOn(statementService, 'removeDuplicateStatement').mockReturnValue({
				statements: [],
				duplicateStatement: undefined,
			});
			jest.spyOn(aiService, 'generateTitleAndDescription').mockResolvedValue({
				title: 'Title',
				description: 'Description',
			});

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			// Parent should be called first (to get threshold), then sub-statements
			expect(parentSpy).toHaveBeenCalledWith('test-statement-id');
			expect(subsSpy).toHaveBeenCalledWith('test-statement-id');
		});

		it('should run validation and AI processing in parallel', async () => {
			const mockParentStatement = {
				statement: 'parent question',
				statementSettings: { numberOfOptionsPerUser: 10 },
			};

			const mockSubStatements = [
				{ statementId: 'sub1', statement: 'statement 1', creatorId: 'creator1' },
			];

			jest
				.spyOn(cachedStatementService, 'getCachedParentStatement')
				.mockResolvedValue(mockParentStatement as Partial<Statement> as Statement);

			jest
				.spyOn(cachedStatementService, 'getCachedSubStatements')
				.mockResolvedValue(mockSubStatements as Partial<Statement>[] as Statement[]);

			jest.spyOn(statementService, 'getUserStatements').mockReturnValue([]);

			const validationSpy = jest
				.spyOn(statementService, 'hasReachedMaxStatements')
				.mockReturnValue(false);

			const aiSpy = jest
				.spyOn(cachedAiService, 'getCachedSimilarStatementIds')
				.mockResolvedValue(['sub1']);

			jest
				.spyOn(statementService, 'convertToSimpleStatements')
				.mockReturnValue([{ id: 'sub1', statement: 'statement 1' }]);

			jest
				.spyOn(statementService, 'getStatementsByIds')
				.mockReturnValue([mockSubStatements[0]] as Partial<Statement>[] as Statement[]);

			jest.spyOn(statementService, 'removeDuplicateStatement').mockReturnValue({
				statements: [mockSubStatements[0]] as Partial<Statement>[] as Statement[],
				duplicateStatement: undefined,
			});

			jest.spyOn(aiService, 'generateTitleAndDescription').mockResolvedValue({
				title: 'Title',
				description: 'Description',
			});

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			// Both should be called (parallel execution)
			expect(validationSpy).toHaveBeenCalled();
			expect(aiSpy).toHaveBeenCalled();
		});
	});

	describe('Error handling', () => {
		beforeEach(() => {
			jest.spyOn(aiService, 'checkForInappropriateContent').mockResolvedValue({
				isInappropriate: false,
			});

			jest.spyOn(cachedAiService, 'getCachedSimilarityResponse').mockResolvedValue(null);
		});

		it('should handle parent statement not found', async () => {
			jest.spyOn(cachedStatementService, 'getCachedParentStatement').mockResolvedValue(null);

			jest.spyOn(cachedStatementService, 'getCachedSubStatements').mockResolvedValue([]);

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockSend).toHaveBeenCalledWith({
				ok: false,
				error: 'Parent statement not found',
			});
		});

		it('should handle user reaching max statements limit', async () => {
			const mockParentStatement = {
				statement: 'parent',
				statementSettings: { numberOfOptionsPerUser: 1 },
			};

			const mockSubStatements = [
				{ statementId: 'sub1', statement: 'statement 1', creatorId: 'test-creator-id' },
			];

			jest
				.spyOn(cachedStatementService, 'getCachedParentStatement')
				.mockResolvedValue(mockParentStatement as Partial<Statement> as Statement);

			jest
				.spyOn(cachedStatementService, 'getCachedSubStatements')
				.mockResolvedValue(mockSubStatements as Partial<Statement>[] as Statement[]);

			jest
				.spyOn(statementService, 'getUserStatements')
				.mockReturnValue(mockSubStatements as Partial<Statement>[] as Statement[]);

			jest.spyOn(statementService, 'hasReachedMaxStatements').mockReturnValue(true);

			jest
				.spyOn(statementService, 'convertToSimpleStatements')
				.mockReturnValue([{ id: 'sub1', statement: 'statement 1' }]);

			jest.spyOn(cachedAiService, 'getCachedSimilarStatements').mockResolvedValue([]);

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			expect(mockStatus).toHaveBeenCalledWith(403);
			expect(mockSend).toHaveBeenCalledWith({
				ok: false,
				error: 'You have reached the maximum number of suggestions allowed.',
			});
		});

		it('should handle general errors', async () => {
			jest
				.spyOn(cachedStatementService, 'getCachedParentStatement')
				.mockRejectedValue(new Error('Database error'));

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockSend).toHaveBeenCalledWith({
				ok: false,
				error: 'Internal server error',
			});
		});
	});

	describe('Performance monitoring', () => {
		it('should include response time in successful responses', async () => {
			jest.spyOn(aiService, 'checkForInappropriateContent').mockResolvedValue({
				isInappropriate: false,
			});

			// Parent statement must be fetched first to get threshold
			jest.spyOn(cachedStatementService, 'getCachedParentStatement').mockResolvedValue({
				statement: 'parent question',
				statementSettings: { similarityThreshold: 0.85 },
			} as Partial<Statement> as Statement);

			jest.spyOn(cachedAiService, 'getCachedSimilarityResponse').mockResolvedValue({
				similarStatements: [],
				userText: 'test',
				generatedTitle: 'Test Title',
				generatedDescription: 'Test Description',
			});

			await findSimilarStatements(mockRequest as Request, mockResponse as Response);

			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					responseTime: expect.any(Number),
				}),
			);
		});
	});
});
