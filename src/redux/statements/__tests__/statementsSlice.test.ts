/**
 * Tests for statementsSlice Redux store
 */

import { Statement, StatementSubscription, StatementType, Role, Access, ResultsBy, CutoffBy } from '@freedi/shared-types';
import {
	statementsSlicer,
	setStatement,
	setStatements,
	deleteStatement,
	setStatementSubscription,
	setScreen,
	resetStatements,
	setStatementOrder,
	StatementScreen,
	totalMessageBoxesSelector,
	screenSelector,
	statementSelectorById,
	statementsSelector,
} from '../statementsSlice';

// Mock error handling
jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

describe('statementsSlice', () => {
	const mockStatement = {
		statementId: 'stmt-123',
		parentId: 'parent-123',
		topParentId: 'top-123',
		statement: 'Test statement content',
		statementType: StatementType.option,
		creator: {
			uid: 'user-123',
			displayName: 'Test User',
			email: 'test@example.com',
		},
		creatorId: 'user-123',
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		consensus: 0.5,
		parents: ['top-123', 'parent-123'],
		results: [],
		resultsSettings: {
			resultsBy: ResultsBy.consensus,
			numberOfResults: 1,
			cutoffBy: CutoffBy.topOptions,
		},
	} as unknown as Statement;

	const mockSubscription = {
		statementId: 'stmt-123',
		statementsSubscribeId: 'sub-123',
		statement: mockStatement,
		role: Role.member,
		lastUpdate: Date.now(),
		userId: 'user-123',
		user: {
			uid: 'user-123',
			displayName: 'Test User',
		},
	} as unknown as StatementSubscription;

	const initialState = statementsSlicer.getInitialState();

	describe('reducers', () => {
		describe('setStatement', () => {
			it('should add new statement to empty state', () => {
				const newState = statementsSlicer.reducer(
					initialState,
					setStatement(mockStatement)
				);

				expect(newState.statements).toHaveLength(1);
				expect(newState.statements[0].statementId).toBe(mockStatement.statementId);
			});

			it('should update existing statement', () => {
				const stateWithStatement = {
					...initialState,
					statements: [mockStatement],
				};
				const updatedStatement = { ...mockStatement, statement: 'Updated content' };

				const newState = statementsSlicer.reducer(
					stateWithStatement,
					setStatement(updatedStatement)
				);

				expect(newState.statements).toHaveLength(1);
				expect(newState.statements[0].statement).toBe('Updated content');
			});

			it('should update statementSubscriptionLastUpdate when statement has newer lastUpdate', () => {
				const futureTime = Date.now() + 100000;
				const newStatement = { ...mockStatement, lastUpdate: futureTime };

				const newState = statementsSlicer.reducer(initialState, setStatement(newStatement));

				expect(newState.statementSubscriptionLastUpdate).toBe(futureTime);
			});

			it('should ensure results is an array for legacy statements', () => {
				const legacyStatement = { ...mockStatement, results: undefined as unknown as [] };

				const newState = statementsSlicer.reducer(initialState, setStatement(legacyStatement));

				expect(Array.isArray(newState.statements[0].results)).toBe(true);
			});

			it('should set order to 0 for new statements', () => {
				const statementWithOrder = { ...mockStatement, order: 5 };

				const newState = statementsSlicer.reducer(initialState, setStatement(statementWithOrder));

				expect(newState.statements[0].order).toBe(0);
			});
		});

		describe('setStatements', () => {
			it('should add multiple statements', () => {
				const statements = [
					mockStatement,
					{ ...mockStatement, statementId: 'stmt-456' },
				];

				const newState = statementsSlicer.reducer(initialState, setStatements(statements));

				expect(newState.statements).toHaveLength(2);
			});

			it('should update existing statements', () => {
				const stateWithStatement = {
					...initialState,
					statements: [mockStatement],
				};
				const updatedStatements = [
					{ ...mockStatement, statement: 'Updated 1' },
					{ ...mockStatement, statementId: 'stmt-new', statement: 'New statement' },
				];

				const newState = statementsSlicer.reducer(
					stateWithStatement,
					setStatements(updatedStatements)
				);

				expect(newState.statements).toHaveLength(2);
			});
		});

		describe('deleteStatement', () => {
			it('should remove statement by ID', () => {
				const stateWithStatement = {
					...initialState,
					statements: [mockStatement],
				};

				const newState = statementsSlicer.reducer(
					stateWithStatement,
					deleteStatement(mockStatement.statementId)
				);

				expect(newState.statements).toHaveLength(0);
			});

			it('should not modify state when statement not found', () => {
				const stateWithStatement = {
					...initialState,
					statements: [mockStatement],
				};

				const newState = statementsSlicer.reducer(
					stateWithStatement,
					deleteStatement('non-existent-id')
				);

				expect(newState.statements).toHaveLength(1);
			});
		});

		describe('setStatementSubscription', () => {
			it('should add new subscription', () => {
				const newState = statementsSlicer.reducer(
					initialState,
					setStatementSubscription(mockSubscription)
				);

				expect(newState.statementSubscription).toHaveLength(1);
				expect(newState.statementSubscription[0].statementId).toBe(mockSubscription.statementId);
			});

			it('should update subscription lastUpdate tracking', () => {
				const futureTime = Date.now() + 100000;
				const newSubscription = { ...mockSubscription, lastUpdate: futureTime };

				const newState = statementsSlicer.reducer(
					initialState,
					setStatementSubscription(newSubscription)
				);

				expect(newState.statementSubscriptionLastUpdate).toBe(futureTime);
			});
		});

		describe('setStatementOrder', () => {
			it('should update statement order', () => {
				const stateWithStatement = {
					...initialState,
					statements: [mockStatement],
				};

				const newState = statementsSlicer.reducer(
					stateWithStatement,
					setStatementOrder({ statementId: mockStatement.statementId as 'string', order: 5 })
				);

				expect(newState.statements[0].order).toBe(5);
			});

			it('should do nothing when statement not found', () => {
				const newState = statementsSlicer.reducer(
					initialState,
					setStatementOrder({ statementId: 'non-existent' as 'string', order: 5 })
				);

				expect(newState.statements).toHaveLength(0);
			});
		});

		describe('setScreen', () => {
			it('should update screen to options', () => {
				const newState = statementsSlicer.reducer(
					initialState,
					setScreen(StatementScreen.options)
				);

				expect(newState.screen).toBe(StatementScreen.options);
			});

			it('should update screen to chat', () => {
				const stateWithOptions = { ...initialState, screen: StatementScreen.options };

				const newState = statementsSlicer.reducer(
					stateWithOptions,
					setScreen(StatementScreen.chat)
				);

				expect(newState.screen).toBe(StatementScreen.chat);
			});
		});

		describe('resetStatements', () => {
			it('should reset all state to initial values', () => {
				const populatedState = {
					statements: [mockStatement],
					statementSubscription: [mockSubscription],
					statementSubscriptionLastUpdate: 12345,
					statementMembership: [mockSubscription],
					screen: StatementScreen.options,
				};

				const newState = statementsSlicer.reducer(populatedState, resetStatements());

				expect(newState.statements).toHaveLength(0);
				expect(newState.statementSubscription).toHaveLength(0);
				expect(newState.statementSubscriptionLastUpdate).toBe(0);
				expect(newState.statementMembership).toHaveLength(0);
				expect(newState.screen).toBe(StatementScreen.chat);
			});
		});
	});

	describe('selectors', () => {
		const mockRootState = {
			statements: {
				statements: [mockStatement],
				statementSubscription: [mockSubscription],
				statementSubscriptionLastUpdate: 12345,
				statementMembership: [],
				screen: StatementScreen.chat,
			},
		};

		describe('totalMessageBoxesSelector', () => {
			it('should return count of statements', () => {
				const result = totalMessageBoxesSelector(mockRootState as Parameters<typeof totalMessageBoxesSelector>[0]);
				expect(result).toBe(1);
			});
		});

		describe('screenSelector', () => {
			it('should return current screen', () => {
				const result = screenSelector(mockRootState as Parameters<typeof screenSelector>[0]);
				expect(result).toBe(StatementScreen.chat);
			});
		});

		describe('statementSelectorById', () => {
			it('should return statement by ID', () => {
				const selector = statementSelectorById(mockStatement.statementId);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result?.statementId).toBe(mockStatement.statementId);
			});

			it('should return undefined for non-existent ID', () => {
				const selector = statementSelectorById('non-existent');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBeUndefined();
			});

			it('should return undefined for undefined ID', () => {
				const selector = statementSelectorById(undefined);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBeUndefined();
			});
		});

		describe('statementsSelector', () => {
			it('should return all statements', () => {
				const result = statementsSelector(mockRootState as Parameters<typeof statementsSelector>[0]);
				expect(result).toHaveLength(1);
				expect(result[0].statementId).toBe(mockStatement.statementId);
			});
		});
	});

	describe('StatementScreen enum', () => {
		it('should have correct values', () => {
			expect(StatementScreen.chat).toBe('chat');
			expect(StatementScreen.options).toBe('options');
		});
	});
});
