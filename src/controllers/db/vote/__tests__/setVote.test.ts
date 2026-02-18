/**
 * Tests for setVote controller
 *
 * NOTE: setVoteToDB uses runTransaction (not setDoc/getDoc directly).
 * We mock runTransaction to control its behavior in tests.
 */

// Mock @freedi/shared-types before import to prevent valibot loading
jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		document: 'document',
		group: 'group',
		comment: 'comment',
	},
	ResultsBy: {
		consensus: 'consensus',
		mostLiked: 'mostLiked',
		averageLikesDislikes: 'averageLikesDislikes',
		topOptions: 'topOptions',
	},
	CutoffBy: {
		topOptions: 'topOptions',
		aboveThreshold: 'aboveThreshold',
	},
	Collections: {
		votes: 'votes',
		statements: 'statements',
	},
	VoteSchema: {},
	getVoteId: jest.fn((userId: string, parentId: string) => `${userId}--${parentId}`),
}));

// Define types locally since we're mocking the module
enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
}

enum ResultsBy {
	consensus = 'consensus',
	mostLiked = 'mostLiked',
	averageLikesDislikes = 'averageLikesDislikes',
	topOptions = 'topOptions',
}

enum CutoffBy {
	topOptions = 'topOptions',
	aboveThreshold = 'aboveThreshold',
}

interface User {
	uid: string;
	displayName: string;
	email: string;
}

interface Statement {
	statementId: string;
	parentId: string;
	topParentId: string;
	statement: string;
	statementType: StatementType;
	creator: User;
	creatorId: string;
	createdAt: number;
	lastUpdate: number;
	consensus: number;
	parents: string[];
	results: unknown[];
	resultsSettings: {
		resultsBy: ResultsBy;
		numberOfResults: number;
		cutoffBy: CutoffBy;
	};
}

// Mock runTransaction to allow us to control the transaction behavior
const mockRunTransaction = jest.fn();
const mockDoc = jest.fn();

// Mock Firebase - use runTransaction
jest.mock('firebase/firestore', () => ({
	doc: jest.fn(),
	runTransaction: jest.fn(),
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

import { setVoteToDB } from '../setVote';
import { runTransaction, doc } from 'firebase/firestore';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';

const mockedRunTransaction = runTransaction as jest.MockedFunction<typeof runTransaction>;
const mockedDoc = doc as jest.MockedFunction<typeof doc>;

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
			resultsBy: ResultsBy.consensus,
			numberOfResults: 1,
			cutoffBy: CutoffBy.topOptions,
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockedDoc.mockReturnValue({} as ReturnType<typeof doc>);
	});

	describe('new vote (no existing vote)', () => {
		beforeEach(() => {
			// Simulate transaction: no existing vote document
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => false,
						data: () => undefined,
					}),
					set: jest.fn(),
				};

				return updateFn(transaction as never);
			});
		});

		it('should call runTransaction when setting a vote', async () => {
			await setVoteToDB(mockOption as never, mockUser as never);

			expect(mockedRunTransaction).toHaveBeenCalledTimes(1);
		});

		it('should log info for new vote', async () => {
			await setVoteToDB(mockOption as never, mockUser as never);

			expect(logger.info).toHaveBeenCalledWith('Vote cast', {
				statementId: 'option-123',
				parentId: 'parent-123',
				userId: 'user-123',
			});
		});

		it('should track analytics for new vote', async () => {
			await setVoteToDB(mockOption as never, mockUser as never);

			expect(analyticsService.trackStatementVote).toHaveBeenCalledWith('option-123', 1, 'button');
		});

		it('should call set inside transaction with correct statementId', async () => {
			let capturedVote: Record<string, unknown> | null = null;
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => false,
						data: () => undefined,
					}),
					set: jest.fn((ref, data) => {
						capturedVote = data as Record<string, unknown>;
					}),
				};

				return updateFn(transaction as never);
			});

			await setVoteToDB(mockOption as never, mockUser as never);

			expect(capturedVote).not.toBeNull();
			expect(capturedVote?.statementId).toBe('option-123');
			expect(capturedVote?.userId).toBe('user-123');
			expect(capturedVote?.parentId).toBe('parent-123');
		});

		it('should include voter information in vote data', async () => {
			let capturedVote: Record<string, unknown> | null = null;
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => false,
						data: () => undefined,
					}),
					set: jest.fn((ref, data) => {
						capturedVote = data as Record<string, unknown>;
					}),
				};

				return updateFn(transaction as never);
			});

			await setVoteToDB(mockOption as never, mockUser as never);

			expect(capturedVote).not.toBeNull();
			expect(capturedVote?.voter).toEqual(mockUser);
		});

		it('should include timestamps in vote data', async () => {
			let capturedVote: Record<string, unknown> | null = null;
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => false,
						data: () => undefined,
					}),
					set: jest.fn((ref, data) => {
						capturedVote = data as Record<string, unknown>;
					}),
				};

				return updateFn(transaction as never);
			});

			await setVoteToDB(mockOption as never, mockUser as never);

			expect(capturedVote).not.toBeNull();
			expect(typeof capturedVote?.lastUpdate).toBe('number');
			expect(typeof capturedVote?.createdAt).toBe('number');
		});
	});

	describe('toggle vote (remove vote)', () => {
		beforeEach(() => {
			// Simulate transaction: existing vote for same option → toggle off
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => true,
						data: () => ({ statementId: 'option-123' }), // Same option → toggle off
					}),
					set: jest.fn(),
				};

				return updateFn(transaction as never);
			});
		});

		it('should set statementId to "none" when toggling off', async () => {
			let capturedVote: Record<string, unknown> | null = null;
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => true,
						data: () => ({ statementId: 'option-123' }),
					}),
					set: jest.fn((ref, data) => {
						capturedVote = data as Record<string, unknown>;
					}),
				};

				return updateFn(transaction as never);
			});

			await setVoteToDB(mockOption as never, mockUser as never);

			expect(capturedVote?.statementId).toBe('none');
		});

		it('should not track analytics when removing vote', async () => {
			await setVoteToDB(mockOption as never, mockUser as never);

			expect(analyticsService.trackStatementVote).not.toHaveBeenCalled();
		});

		it('should log info for removed vote', async () => {
			await setVoteToDB(mockOption as never, mockUser as never);

			expect(logger.info).toHaveBeenCalledWith('Vote removed', {
				statementId: 'option-123',
				parentId: 'parent-123',
				userId: 'user-123',
			});
		});
	});

	describe('change vote (vote for different option)', () => {
		beforeEach(() => {
			// Simulate transaction: existing vote for different option → update
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => true,
						data: () => ({ statementId: 'different-option-456' }), // Different option
					}),
					set: jest.fn(),
				};

				return updateFn(transaction as never);
			});
		});

		it('should update vote when voting for different option', async () => {
			let capturedVote: Record<string, unknown> | null = null;
			mockedRunTransaction.mockImplementation(async (_firestore, updateFn) => {
				const transaction = {
					get: jest.fn().mockResolvedValue({
						exists: () => true,
						data: () => ({ statementId: 'different-option-456' }),
					}),
					set: jest.fn((ref, data) => {
						capturedVote = data as Record<string, unknown>;
					}),
				};

				return updateFn(transaction as never);
			});

			await setVoteToDB(mockOption as never, mockUser as never);

			// Should store the new option, not 'none'
			expect(capturedVote?.statementId).toBe('option-123');
		});

		it('should track analytics when changing vote', async () => {
			await setVoteToDB(mockOption as never, mockUser as never);

			expect(analyticsService.trackStatementVote).toHaveBeenCalledWith('option-123', 1, 'button');
		});
	});

	describe('error handling', () => {
		it('should log error when transaction fails', async () => {
			mockedRunTransaction.mockRejectedValue(new Error('Firebase transaction error'));

			await setVoteToDB(mockOption as never, mockUser as never);

			expect(logger.error).toHaveBeenCalledWith('Failed to set vote', expect.any(Error), {
				statementId: 'option-123',
				userId: 'user-123',
			});
		});

		it('should not throw when transaction fails', async () => {
			mockedRunTransaction.mockRejectedValue(new Error('Firebase error'));

			// Should not throw
			await expect(setVoteToDB(mockOption as never, mockUser as never)).resolves.toBeUndefined();
		});

		it('should not track analytics when transaction fails', async () => {
			mockedRunTransaction.mockRejectedValue(new Error('Firebase error'));

			await setVoteToDB(mockOption as never, mockUser as never);

			expect(analyticsService.trackStatementVote).not.toHaveBeenCalled();
		});
	});
});
