/**
 * Tests for setFeedback controller
 */

import { Feedback } from '@freedi/shared-types';
import { setFeedbackToDB } from '../setFeedback';

// Mock Firebase
jest.mock('firebase/firestore', () => ({
	doc: jest.fn(),
	setDoc: jest.fn(),
}));

jest.mock('../../config', () => ({
	DB: {},
}));

import { doc, setDoc } from 'firebase/firestore';

const mockDoc = doc as jest.MockedFunction<typeof doc>;
const mockSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;

describe('setFeedback', () => {
	const mockFeedback: Feedback = {
		feedbackId: 'feedback-123',
		statementId: 'stmt-123',
		statementTitle: 'Test Statement',
		feedbackText: 'This is feedback text',
		creator: {
			displayName: 'Test User',
			uid: 'user-123',
		},
		createdAt: Date.now(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
		mockSetDoc.mockResolvedValue(undefined);
		jest.spyOn(console, 'info').mockImplementation(() => {});
		jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('successful save', () => {
		it('should save feedback to database', async () => {
			await setFeedbackToDB(mockFeedback);

			expect(mockSetDoc).toHaveBeenCalledWith(expect.anything(), mockFeedback);
		});

		it('should log success message', async () => {
			await setFeedbackToDB(mockFeedback);

			expect(console.info).toHaveBeenCalledWith('Feedback saved successfully:', 'feedback-123');
		});

		it('should create document reference with correct collection and id', async () => {
			await setFeedbackToDB(mockFeedback);

			expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'feedback', 'feedback-123');
		});
	});

	describe('validation errors', () => {
		it('should throw error when feedbackId is missing', async () => {
			const invalidFeedback = { ...mockFeedback, feedbackId: '' };

			await expect(setFeedbackToDB(invalidFeedback as Feedback)).rejects.toThrow(
				'Feedback ID is required',
			);
		});

		it('should throw error when feedbackId is undefined', async () => {
			const invalidFeedback = { ...mockFeedback, feedbackId: undefined };

			await expect(setFeedbackToDB(invalidFeedback as unknown as Feedback)).rejects.toThrow(
				'Feedback ID is required',
			);
		});

		it('should throw error when statementId is missing', async () => {
			const invalidFeedback = { ...mockFeedback, statementId: '' };

			await expect(setFeedbackToDB(invalidFeedback as Feedback)).rejects.toThrow(
				'Statement ID is required',
			);
		});

		it('should throw error when statementId is undefined', async () => {
			const invalidFeedback = { ...mockFeedback, statementId: undefined };

			await expect(setFeedbackToDB(invalidFeedback as unknown as Feedback)).rejects.toThrow(
				'Statement ID is required',
			);
		});

		it('should throw error when feedbackText is missing', async () => {
			const invalidFeedback = { ...mockFeedback, feedbackText: '' };

			await expect(setFeedbackToDB(invalidFeedback as Feedback)).rejects.toThrow(
				'Feedback text is required',
			);
		});

		it('should throw error when feedbackText is only whitespace', async () => {
			const invalidFeedback = { ...mockFeedback, feedbackText: '   ' };

			await expect(setFeedbackToDB(invalidFeedback as Feedback)).rejects.toThrow(
				'Feedback text is required',
			);
		});

		it('should throw error when feedbackText is undefined', async () => {
			const invalidFeedback = { ...mockFeedback, feedbackText: undefined };

			await expect(setFeedbackToDB(invalidFeedback as unknown as Feedback)).rejects.toThrow(
				'Feedback text is required',
			);
		});
	});

	describe('database errors', () => {
		it('should throw error when setDoc fails', async () => {
			const dbError = new Error('Database connection failed');
			mockSetDoc.mockRejectedValue(dbError);

			await expect(setFeedbackToDB(mockFeedback)).rejects.toThrow('Database connection failed');
		});

		it('should log error when setDoc fails', async () => {
			const dbError = new Error('Database connection failed');
			mockSetDoc.mockRejectedValue(dbError);

			try {
				await setFeedbackToDB(mockFeedback);
			} catch {
				// Expected to throw
			}

			expect(console.error).toHaveBeenCalled();
		});
	});

	describe('edge cases', () => {
		it('should handle feedback with minimal required fields', async () => {
			const minimalFeedback: Feedback = {
				feedbackId: 'min-123',
				statementId: 'stmt-456',
				statementTitle: 'Minimal Statement',
				feedbackText: 'x',
				creator: {
					displayName: 'Min User',
					uid: 'user-789',
				},
				createdAt: Date.now(),
			};

			await setFeedbackToDB(minimalFeedback);

			expect(mockSetDoc).toHaveBeenCalled();
		});

		it('should handle feedback with long text', async () => {
			const longFeedback: Feedback = {
				...mockFeedback,
				feedbackText: 'a'.repeat(10000),
			};

			await setFeedbackToDB(longFeedback);

			expect(mockSetDoc).toHaveBeenCalledWith(expect.anything(), longFeedback);
		});

		it('should handle feedback with special characters', async () => {
			const specialFeedback: Feedback = {
				...mockFeedback,
				feedbackText: '<script>alert("xss")</script> & special chars: éàü',
			};

			await setFeedbackToDB(specialFeedback);

			expect(mockSetDoc).toHaveBeenCalledWith(expect.anything(), specialFeedback);
		});

		it('should handle feedback with unicode characters', async () => {
			const unicodeFeedback: Feedback = {
				...mockFeedback,
				feedbackText: '这是反馈 🎉 👍',
			};

			await setFeedbackToDB(unicodeFeedback);

			expect(mockSetDoc).toHaveBeenCalledWith(expect.anything(), unicodeFeedback);
		});
	});

	describe('feedbackText trimming', () => {
		it('should accept feedback with leading/trailing whitespace if text exists', async () => {
			const feedbackWithWhitespace: Feedback = {
				...mockFeedback,
				feedbackText: '  valid text  ',
			};

			await setFeedbackToDB(feedbackWithWhitespace);

			expect(mockSetDoc).toHaveBeenCalled();
		});
	});
});
