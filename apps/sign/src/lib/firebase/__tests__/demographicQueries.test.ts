/**
 * Tests for demographicQueries - demographic survey query utilities
 */

import { UserDemographicQuestionType } from '@freedi/shared-types';

// Mock dependencies
jest.mock('../admin', () => ({
	getFirestoreAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

import { getFirestoreAdmin } from '../admin';
import {
	getDemographicQuestions,
	// getUserDemographicAnswers is tested implicitly through checkSurveyCompletion
	checkSurveyCompletion,
	saveDemographicQuestion,
	deleteDemographicQuestion,
} from '../demographicQueries';
import { logError } from '@/lib/utils/errorHandling';

describe('demographicQueries', () => {
	// Mock Firestore database
	const mockDoc = jest.fn();
	const mockCollection = jest.fn();
	const mockWhere = jest.fn();
	const mockOrderBy = jest.fn();
	const mockGet = jest.fn();
	const mockSet = jest.fn();
	const mockDelete = jest.fn();
	const mockBatch = jest.fn();
	const mockBatchSet = jest.fn();
	const mockBatchCommit = jest.fn();

	const mockDb = {
		collection: mockCollection,
		doc: mockDoc,
		batch: mockBatch,
	};

	beforeEach(() => {
		jest.clearAllMocks();

		// Setup chainable mock
		mockCollection.mockReturnValue({
			doc: mockDoc,
			where: mockWhere,
		});
		mockDoc.mockReturnValue({
			get: mockGet,
			set: mockSet,
			delete: mockDelete,
		});
		mockWhere.mockReturnValue({
			where: mockWhere,
			orderBy: mockOrderBy,
			get: mockGet,
		});
		mockOrderBy.mockReturnValue({
			get: mockGet,
		});
		mockBatch.mockReturnValue({
			set: mockBatchSet,
			commit: mockBatchCommit,
		});
		mockBatchCommit.mockResolvedValue(undefined);

		(getFirestoreAdmin as jest.Mock).mockReturnValue(mockDb);
	});

	describe('getDemographicQuestions', () => {
		it('should return empty array when mode is disabled', async () => {
			const result = await getDemographicQuestions('doc-123', 'disabled', 'top-123');

			expect(result).toEqual([]);
			expect(getFirestoreAdmin).not.toHaveBeenCalled();
		});

		it('should query inherited questions for inherit mode', async () => {
			const mockGroupQuestions = [
				{ userQuestionId: 'q1', question: 'Group Q1', order: 1 },
			];
			const mockStatementQuestions = [
				{ userQuestionId: 'q2', question: 'Statement Q1', order: 2 },
			];

			mockGet
				.mockResolvedValueOnce({
					docs: mockGroupQuestions.map((q) => ({ data: () => q })),
				})
				.mockResolvedValueOnce({
					docs: mockStatementQuestions.map((q) => ({ data: () => q })),
				});

			const result = await getDemographicQuestions('doc-123', 'inherit', 'top-123');

			expect(result).toHaveLength(2);
			expect(result[0].isInherited).toBe(true);
			expect(result[1].isInherited).toBe(true);
		});

		it('should sort questions by order', async () => {
			const mockQuestions = [
				{ userQuestionId: 'q2', order: 2 },
				{ userQuestionId: 'q1', order: 1 },
			];

			mockGet
				.mockResolvedValueOnce({
					docs: mockQuestions.map((q) => ({ data: () => q })),
				})
				.mockResolvedValueOnce({ docs: [] });

			const result = await getDemographicQuestions('doc-123', 'inherit', 'top-123');

			expect(result[0].order).toBe(1);
			expect(result[1].order).toBe(2);
		});

		it('should query custom questions for custom mode', async () => {
			const mockQuestions = [
				{ userQuestionId: 'q1', question: 'Custom Q1' },
			];

			mockGet.mockResolvedValueOnce({
				docs: mockQuestions.map((q) => ({ data: () => q })),
			});

			const result = await getDemographicQuestions('doc-123', 'custom', 'top-123');

			expect(result).toHaveLength(1);
			expect(result[0].isInherited).toBe(false);
		});

		it('should throw and log error on failure', async () => {
			const error = new Error('Query failed');
			mockGet.mockRejectedValueOnce(error);

			await expect(
				getDemographicQuestions('doc-123', 'custom', 'top-123')
			).rejects.toThrow('Query failed');
			expect(logError).toHaveBeenCalled();
		});
	});

	describe('checkSurveyCompletion', () => {
		it('should return complete status when mode is disabled', async () => {
			const result = await checkSurveyCompletion(
				'doc-123',
				'user-456',
				'disabled',
				'top-123',
				true
			);

			expect(result.isComplete).toBe(true);
			expect(result.totalQuestions).toBe(0);
			expect(result.isRequired).toBe(false);
		});

		it('should return complete when all questions answered', async () => {
			// Mock getDemographicQuestions to return questions
			mockGet
				.mockResolvedValueOnce({
					docs: [
						{ data: () => ({ userQuestionId: 'q1', question: 'Q1' }) },
					],
				})
				.mockResolvedValueOnce({ docs: [] })
				// Mock answer lookup
				.mockResolvedValueOnce({
					exists: true,
					data: () => ({ answer: 'My answer' }),
				});

			const result = await checkSurveyCompletion(
				'doc-123',
				'user-456',
				'inherit',
				'top-123',
				true
			);

			expect(result.isComplete).toBe(true);
			expect(result.answeredQuestions).toBe(1);
		});

		it('should return incomplete when questions unanswered', async () => {
			mockGet
				.mockResolvedValueOnce({
					docs: [
						{ data: () => ({ userQuestionId: 'q1', question: 'Q1' }) },
					],
				})
				.mockResolvedValueOnce({ docs: [] })
				.mockResolvedValueOnce({ exists: false });

			const result = await checkSurveyCompletion(
				'doc-123',
				'user-456',
				'inherit',
				'top-123',
				true
			);

			expect(result.isComplete).toBe(false);
			expect(result.missingQuestionIds).toContain('q1');
		});

		it('should handle errors gracefully', async () => {
			mockGet.mockRejectedValueOnce(new Error('Query error'));

			const result = await checkSurveyCompletion(
				'doc-123',
				'user-456',
				'inherit',
				'top-123',
				true
			);

			expect(result.isComplete).toBe(false);
			expect(logError).toHaveBeenCalled();
		});
	});

	describe('saveDemographicQuestion', () => {
		it('should save question with generated ID', async () => {
			mockSet.mockResolvedValueOnce(undefined);

			const question = {
				question: 'What is your age?',
				type: UserDemographicQuestionType.number,
				order: 1,
			};

			const result = await saveDemographicQuestion('doc-123', 'top-123', question);

			expect(result.question).toBe('What is your age?');
			expect(result.userQuestionId).toMatch(/^sign-doc-123-/);
			expect(result.isInherited).toBe(false);
			expect(mockSet).toHaveBeenCalled();
		});

		it('should use provided userQuestionId', async () => {
			mockSet.mockResolvedValueOnce(undefined);

			const question = {
				userQuestionId: 'custom-id-123',
				question: 'Custom question',
			};

			const result = await saveDemographicQuestion('doc-123', 'top-123', question);

			expect(result.userQuestionId).toBe('custom-id-123');
		});

		it('should throw and log error on failure', async () => {
			mockSet.mockRejectedValueOnce(new Error('Save failed'));

			await expect(
				saveDemographicQuestion('doc-123', 'top-123', { question: 'Q' })
			).rejects.toThrow('Save failed');
			expect(logError).toHaveBeenCalled();
		});
	});

	describe('deleteDemographicQuestion', () => {
		it('should delete question by ID', async () => {
			mockDelete.mockResolvedValueOnce(undefined);

			await deleteDemographicQuestion('question-123');

			expect(mockDelete).toHaveBeenCalled();
		});

		it('should throw and log error on failure', async () => {
			mockDelete.mockRejectedValueOnce(new Error('Delete failed'));

			await expect(deleteDemographicQuestion('question-123')).rejects.toThrow(
				'Delete failed'
			);
			expect(logError).toHaveBeenCalled();
		});
	});
});
