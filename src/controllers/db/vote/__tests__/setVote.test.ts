/**
 * Tests for setVote controller
 */

import { Statement, User, Vote, StatementType } from '@freedi/shared-types';
import { setVoteToDB } from '../setVote';

// Mock Firebase
jest.mock('firebase/firestore', () => ({
	doc: jest.fn(),
	getDoc: jest.fn(),
	setDoc: jest.fn(),
	Timestamp: {
		now: jest.fn(() => ({
			toMillis: jest.fn(() => 1704067200000),
		})),
	},
}));

jest.mock('../../config', () => ({
	FireStore: {},
}));

// Mock valibot
jest.mock('valibot', () => ({
	parse: jest.fn((schema, value) => value),
}));

// Mock services
jest.mock('@/services/analytics', () => ({
	analyticsService: {
		trackStatementVote: jest.fn(),
	},
}));

jest.mock('@/services/logger', () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
	},
}));

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';

const mockDoc = doc as jest.MockedFunction<typeof doc>;
const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;

describe('setVote', () => {
	const mockUser: User = {
		uid: 'user-123',
		displayName: 'Test User',
		email: 'test@example.com',
	};

	const mockOption: Statement = {
		statementId: 'option-123',
		parentId: 'parent-123',
		topParentId: 'top-123',
		statement: 'Option text',
		statementType: StatementType.option,
		creator: mockUser,
		creatorId: mockUser.uid,
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		consensus: 0,
		parents: ['top-123', 'parent-123'],
		results: [],
		resultsSettings: {
			resultsBy: 'consensus',
			numberOfResults: 1,
			cutoffBy: 'topOptions',
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
		mockSetDoc.mockResolvedValue(undefined);
	});

	describe('new vote', () => {
		it('should create a new vote when no existing vote', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
				data: () => undefined,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					statementId: 'option-123',
					parentId: 'parent-123',
					userId: 'user-123',
				}),
				{ merge: true }
			);
		});

		it('should track analytics for new vote', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
				data: () => undefined,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(analyticsService.trackStatementVote).toHaveBeenCalledWith(
				'option-123',
				1,
				'button'
			);
		});

		it('should log info for new vote', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
				data: () => undefined,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(logger.info).toHaveBeenCalledWith('Vote cast', {
				statementId: 'option-123',
				parentId: 'parent-123',
				userId: 'user-123',
			});
		});
	});

	describe('toggle vote (remove vote)', () => {
		it('should remove vote when voting for same option', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
				data: () => ({ statementId: 'option-123' }),
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					statementId: 'none',
				}),
				{ merge: true }
			);
		});

		it('should not track analytics when removing vote', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
				data: () => ({ statementId: 'option-123' }),
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(analyticsService.trackStatementVote).not.toHaveBeenCalled();
		});

		it('should log info for removed vote', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
				data: () => ({ statementId: 'option-123' }),
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(logger.info).toHaveBeenCalledWith('Vote removed', {
				statementId: 'option-123',
				parentId: 'parent-123',
				userId: 'user-123',
			});
		});
	});

	describe('change vote', () => {
		it('should update vote when voting for different option', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
				data: () => ({ statementId: 'different-option-456' }),
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					statementId: 'option-123', // New option, not 'none'
				}),
				{ merge: true }
			);
		});

		it('should track analytics when changing vote', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
				data: () => ({ statementId: 'different-option-456' }),
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(analyticsService.trackStatementVote).toHaveBeenCalled();
		});
	});

	describe('vote data structure', () => {
		it('should include voter information', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
				data: () => undefined,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					voter: mockUser,
				}),
				{ merge: true }
			);
		});

		it('should include timestamps', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
				data: () => undefined,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setVoteToDB(mockOption, mockUser);

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					lastUpdate: expect.any(Number),
					createdAt: expect.any(Number),
				}),
				{ merge: true }
			);
		});
	});

	describe('error handling', () => {
		it('should log error when setDoc fails', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
				data: () => undefined,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);
			mockSetDoc.mockRejectedValue(new Error('Firebase error'));

			await setVoteToDB(mockOption, mockUser);

			expect(logger.error).toHaveBeenCalledWith(
				'Failed to set vote',
				expect.any(Error),
				{
					statementId: 'option-123',
					userId: 'user-123',
				}
			);
		});

		it('should log error when getDoc fails', async () => {
			mockGetDoc.mockRejectedValue(new Error('Firebase read error'));

			await setVoteToDB(mockOption, mockUser);

			expect(logger.error).toHaveBeenCalledWith(
				'Failed to set vote',
				expect.any(Error),
				expect.any(Object)
			);
		});
	});
});
