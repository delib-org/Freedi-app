/**
 * Tests for votesSlice Redux store
 */

// Mock @freedi/shared-types before import
jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		document: 'document',
		group: 'group',
		comment: 'comment',
	},
	StatementSchema: {},
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

// Mock valibot
jest.mock('valibot', () => ({
	parse: jest.fn((schema, value) => value),
	safeParse: jest.fn((schema, data) => ({ success: true, output: data })),
	string: jest.fn(() => ({})),
	number: jest.fn(() => ({})),
	boolean: jest.fn(() => ({})),
	object: jest.fn(() => ({})),
	array: jest.fn(() => ({})),
	optional: jest.fn((s) => s),
	nullable: jest.fn((s) => s),
	union: jest.fn(() => ({})),
	literal: jest.fn(() => ({})),
	enum_: jest.fn(() => ({})),
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

interface Creator {
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
	creator: Creator;
	creatorId: string;
	createdAt: number;
	lastUpdate: number;
	consensus: number;
	parents: string[];
	results: unknown[];
	resultsSettings: {
		resultsBy: string;
		numberOfResults: number;
		cutoffBy: string;
	};
}

interface Vote {
	voteId: string;
	statementId: string;
	parentId: string;
	userId: string;
	createdAt: number;
	lastUpdate: number;
}

import {
	votesSlicer,
	setVoteToStore,
	resetVotes,
	votesSelector,
	parentVoteSelector,
} from '../votesSlice';

// Mock timestamp helpers
jest.mock('@/helpers/timestampHelpers', () => ({
	normalizeStatementData: jest.fn((data) => data),
}));

describe('votesSlice', () => {
	const mockStatement: Statement = {
		statementId: 'option-123',
		parentId: 'parent-123',
		topParentId: 'top-123',
		statement: 'Test option',
		statementType: StatementType.option,
		creator: {
			uid: 'user-123',
			displayName: 'Test User',
			email: 'test@example.com',
		},
		creatorId: 'user-123',
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

	const initialState = votesSlicer.getInitialState();

	describe('reducers', () => {
		describe('setVoteToStore', () => {
			it('should add new vote when no existing vote', () => {
				const newState = votesSlicer.reducer(
					initialState,
					setVoteToStore(mockStatement)
				);

				expect(newState.votes).toHaveLength(1);
				expect(newState.votes[0].statementId).toBe('option-123');
				expect(newState.votes[0].parentId).toBe('parent-123');
				expect(newState.votes[0].userId).toBe('user-123');
			});

			it('should toggle vote to "none" when voting for same option', () => {
				const existingVote: Vote = {
					voteId: 'user-123--parent-123',
					statementId: 'option-123',
					parentId: 'parent-123',
					userId: 'user-123',
					createdAt: Date.now(),
					lastUpdate: Date.now(),
				};

				const stateWithVote = {
					votes: [existingVote],
				};

				const newState = votesSlicer.reducer(
					stateWithVote,
					setVoteToStore(mockStatement)
				);

				expect(newState.votes).toHaveLength(1);
				expect(newState.votes[0].statementId).toBe('none');
			});

			it('should change vote when voting for different option', () => {
				const existingVote: Vote = {
					voteId: 'user-123--parent-123',
					statementId: 'other-option-456',
					parentId: 'parent-123',
					userId: 'user-123',
					createdAt: Date.now(),
					lastUpdate: Date.now(),
				};

				const stateWithVote = {
					votes: [existingVote],
				};

				const newState = votesSlicer.reducer(
					stateWithVote,
					setVoteToStore(mockStatement)
				);

				expect(newState.votes).toHaveLength(1);
				expect(newState.votes[0].statementId).toBe('option-123');
			});

			it('should create correct voteId from user and parent', () => {
				const newState = votesSlicer.reducer(
					initialState,
					setVoteToStore(mockStatement)
				);

				expect(newState.votes[0].voteId).toBe('user-123--parent-123');
			});

			it('should include timestamp fields', () => {
				const newState = votesSlicer.reducer(
					initialState,
					setVoteToStore(mockStatement)
				);

				expect(newState.votes[0].createdAt).toBeDefined();
				expect(newState.votes[0].lastUpdate).toBeDefined();
				expect(typeof newState.votes[0].createdAt).toBe('number');
				expect(typeof newState.votes[0].lastUpdate).toBe('number');
			});

			it('should handle multiple votes for different parents', () => {
				let state = initialState;

				// First vote
				state = votesSlicer.reducer(state, setVoteToStore(mockStatement));

				// Second vote for different parent
				const secondStatement = {
					...mockStatement,
					statementId: 'option-456',
					parentId: 'parent-456',
				};
				state = votesSlicer.reducer(state, setVoteToStore(secondStatement));

				expect(state.votes).toHaveLength(2);
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
							createdAt: Date.now(),
							lastUpdate: Date.now(),
						},
						{
							voteId: 'vote-2',
							statementId: 'option-2',
							parentId: 'parent-2',
							userId: 'user-2',
							createdAt: Date.now(),
							lastUpdate: Date.now(),
						},
					] as Vote[],
				};

				const newState = votesSlicer.reducer(stateWithVotes, resetVotes());

				expect(newState.votes).toHaveLength(0);
			});

			it('should do nothing on empty state', () => {
				const newState = votesSlicer.reducer(initialState, resetVotes());

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
						createdAt: Date.now(),
						lastUpdate: Date.now(),
					},
					{
						voteId: 'user-456--parent-456',
						statementId: 'option-456',
						parentId: 'parent-456',
						userId: 'user-456',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
					},
				] as Vote[],
			},
		};

		describe('votesSelector', () => {
			it('should return all votes', () => {
				const result = votesSelector(mockRootState as unknown as ReturnType<typeof votesSelector>);

				expect(result).toHaveLength(2);
			});
		});

		describe('parentVoteSelector', () => {
			it('should return vote for specific parent', () => {
				const selector = parentVoteSelector('parent-123');
				const result = selector(mockRootState as unknown as ReturnType<typeof selector>);

				expect(result?.parentId).toBe('parent-123');
				expect(result?.statementId).toBe('option-123');
			});

			it('should return undefined for non-existent parent', () => {
				const selector = parentVoteSelector('non-existent');
				const result = selector(mockRootState as unknown as ReturnType<typeof selector>);

				expect(result).toBeUndefined();
			});

			it('should return undefined for undefined parentId', () => {
				const selector = parentVoteSelector(undefined);
				const result = selector(mockRootState as unknown as ReturnType<typeof selector>);

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
			expect(votesSlicer.name).toBe('votes');
		});
	});

	describe('action creators', () => {
		it('setVoteToStore should create correct action', () => {
			const action = setVoteToStore(mockStatement);

			expect(action.type).toBe('votes/setVoteToStore');
			expect(action.payload).toEqual(mockStatement);
		});

		it('resetVotes should create correct action', () => {
			const action = resetVotes();

			expect(action.type).toBe('votes/resetVotes');
		});
	});
});
