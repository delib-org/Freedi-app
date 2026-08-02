/**
 * Tests for votesSlice Redux store
 */

// Mock @freedi/shared-types before import
jest.mock('@freedi/shared-types', () => ({
	getVoteId: jest.fn((userId: string, parentId: string) => `${userId}--${parentId}`),
	updateArray: jest.fn((array: unknown[], newItem: unknown, key: string) => {
		const arr = array as Record<string, unknown>[];
		const item = newItem as Record<string, unknown>;
		const index = arr.findIndex((i) => i[key] === item[key]);
		if (index === -1) {
			return [...arr, item];
		}

		const newArr = [...arr];
		newArr[index] = item;

		return newArr;
	}),
}));

jest.mock('@/utils/firebaseUtils', () => ({
	getCurrentTimestamp: jest.fn(() => 1700000000000),
}));

interface Vote {
	voteId: string;
	statementId: string;
	parentId: string;
	userId: string;
	createdAt: number;
	lastUpdate: number;
}

import {
	votesSlice,
	setVoteToStore,
	resetVotes,
	votesSelector,
	parentVoteSelector,
} from '../votesSlice';
import { logError } from '@/utils/errorHandling';

jest.mock('@/utils/errorHandling', () => {
	class ValidationError extends Error {}

	return {
		logError: jest.fn(),
		ValidationError,
	};
});

describe('votesSlice', () => {
	const votePayload = {
		parentId: 'parent-123',
		optionId: 'option-123',
		userId: 'user-123',
	};

	const initialState = votesSlice.getInitialState();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('reducers', () => {
		describe('setVoteToStore', () => {
			it('should add new vote when no existing vote', () => {
				const newState = votesSlice.reducer(initialState, setVoteToStore(votePayload));

				expect(newState.votes).toHaveLength(1);
				expect(newState.votes[0].statementId).toBe('option-123');
				expect(newState.votes[0].parentId).toBe('parent-123');
				expect(newState.votes[0].userId).toBe('user-123');
			});

			it('should store "none" verbatim when the caller withdraws the vote', () => {
				const stateWithVote = {
					votes: [
						{
							voteId: 'user-123--parent-123',
							statementId: 'option-123',
							parentId: 'parent-123',
							userId: 'user-123',
							createdAt: 1,
							lastUpdate: 1,
						},
					] as Vote[],
				};

				const newState = votesSlice.reducer(
					stateWithVote,
					setVoteToStore({ ...votePayload, optionId: 'none' }),
				);

				expect(newState.votes).toHaveLength(1);
				expect(newState.votes[0].statementId).toBe('none');
			});

			it('should not toggle off when the same option is set twice', () => {
				const stateWithVote = {
					votes: [
						{
							voteId: 'user-123--parent-123',
							statementId: 'option-123',
							parentId: 'parent-123',
							userId: 'user-123',
							createdAt: 1,
							lastUpdate: 1,
						},
					] as Vote[],
				};

				const newState = votesSlice.reducer(stateWithVote, setVoteToStore(votePayload));

				expect(newState.votes).toHaveLength(1);
				expect(newState.votes[0].statementId).toBe('option-123');
			});

			it('should change vote when voting for different option', () => {
				const stateWithVote = {
					votes: [
						{
							voteId: 'user-123--parent-123',
							statementId: 'other-option-456',
							parentId: 'parent-123',
							userId: 'user-123',
							createdAt: 1,
							lastUpdate: 1,
						},
					] as Vote[],
				};

				const newState = votesSlice.reducer(stateWithVote, setVoteToStore(votePayload));

				expect(newState.votes).toHaveLength(1);
				expect(newState.votes[0].statementId).toBe('option-123');
			});

			it('should create correct voteId from user and parent', () => {
				const newState = votesSlice.reducer(initialState, setVoteToStore(votePayload));

				expect(newState.votes[0].voteId).toBe('user-123--parent-123');
			});

			it('should include timestamp fields in milliseconds', () => {
				const newState = votesSlice.reducer(initialState, setVoteToStore(votePayload));

				expect(newState.votes[0].createdAt).toBe(1700000000000);
				expect(newState.votes[0].lastUpdate).toBe(1700000000000);
			});

			it('should handle multiple votes for different parents', () => {
				let state = votesSlice.reducer(initialState, setVoteToStore(votePayload));

				state = votesSlice.reducer(
					state,
					setVoteToStore({
						parentId: 'parent-456',
						optionId: 'option-456',
						userId: 'user-123',
					}),
				);

				expect(state.votes).toHaveLength(2);
			});

			it('should log and drop an incomplete payload', () => {
				const newState = votesSlice.reducer(
					initialState,
					setVoteToStore({ ...votePayload, userId: '' }),
				);

				expect(newState.votes).toHaveLength(0);
				expect(logError).toHaveBeenCalledWith(
					expect.any(Error),
					expect.objectContaining({
						operation: 'redux.vote.votesSlice.setVoteToStore',
					}),
				);
			});
		});

		describe('resetVotes', () => {
			it('should clear all votes', () => {
				const stateWithVotes = {
					votes: [
						{
							voteId: 'vote-1',
							statementId: 'option-1',
							parentId: 'parent-1',
							userId: 'user-1',
							createdAt: 1,
							lastUpdate: 1,
						},
						{
							voteId: 'vote-2',
							statementId: 'option-2',
							parentId: 'parent-2',
							userId: 'user-2',
							createdAt: 1,
							lastUpdate: 1,
						},
					] as Vote[],
				};

				const newState = votesSlice.reducer(stateWithVotes, resetVotes());

				expect(newState.votes).toHaveLength(0);
			});

			it('should do nothing on empty state', () => {
				const newState = votesSlice.reducer(initialState, resetVotes());

				expect(newState.votes).toHaveLength(0);
			});
		});
	});

	describe('selectors', () => {
		const mockRootState = {
			votes: {
				votes: [
					{
						voteId: 'user-123--parent-123',
						statementId: 'option-123',
						parentId: 'parent-123',
						userId: 'user-123',
						createdAt: 1,
						lastUpdate: 1,
					},
					{
						voteId: 'user-456--parent-456',
						statementId: 'option-456',
						parentId: 'parent-456',
						userId: 'user-456',
						createdAt: 1,
						lastUpdate: 1,
					},
				] as Vote[],
			},
		};

		describe('votesSelector', () => {
			it('should return all votes', () => {
				const result = votesSelector(mockRootState as Parameters<typeof votesSelector>[0]);

				expect(result).toHaveLength(2);
			});
		});

		describe('parentVoteSelector', () => {
			it('should return vote for specific parent', () => {
				const selector = parentVoteSelector('parent-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);

				expect(result?.parentId).toBe('parent-123');
				expect(result?.statementId).toBe('option-123');
			});

			it('should return undefined for non-existent parent', () => {
				const selector = parentVoteSelector('non-existent');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);

				expect(result).toBeUndefined();
			});

			it('should return undefined for undefined parentId', () => {
				const selector = parentVoteSelector(undefined);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);

				expect(result).toBeUndefined();
			});
		});
	});

	describe('initial state', () => {
		it('should have empty votes array', () => {
			expect(initialState.votes).toEqual([]);
		});
	});

	describe('slice name', () => {
		it('should have correct name', () => {
			expect(votesSlice.name).toBe('votes');
		});
	});

	describe('action creators', () => {
		it('setVoteToStore should create correct action', () => {
			const action = setVoteToStore(votePayload);

			expect(action.type).toBe('votes/setVoteToStore');
			expect(action.payload).toEqual(votePayload);
		});

		it('resetVotes should create correct action', () => {
			const action = resetVotes();

			expect(action.type).toBe('votes/resetVotes');
		});
	});
});
