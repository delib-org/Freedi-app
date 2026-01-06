/**
 * Tests for evaluationsSlice Redux store
 */

// Mock @freedi/shared-types before import to prevent valibot loading
jest.mock('@freedi/shared-types', () => ({
	EvaluationSchema: {},
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

// Mock valibot parse
jest.mock('valibot', () => ({
	parse: jest.fn((schema, value) => value),
}));

// Define types locally
interface Evaluation {
	evaluationId: string;
	statementId: string;
	parentId: string;
	evaluatorId: string;
	evaluation: number;
	updatedAt: number;
}

import {
	evaluationsSlicer,
	setEvaluationToStore,
	resetEvaluations,
	evaluationsSelector,
	evaluationsParentSelector,
	evaluationSelector,
	numberOfEvaluatedStatements,
	userVotesInParentSelector,
	userVotedStatementsInParentSelector,
} from '../evaluationsSlice';

describe('evaluationsSlice', () => {
	const mockEvaluation: Evaluation = {
		evaluationId: 'eval-123',
		statementId: 'stmt-123',
		parentId: 'parent-123',
		evaluatorId: 'user-123',
		evaluation: 0.5,
		updatedAt: Date.now(),
	};

	const initialState = evaluationsSlicer.getInitialState();

	describe('reducers', () => {
		describe('setEvaluationToStore', () => {
			it('should add new evaluation to empty state', () => {
				const newState = evaluationsSlicer.reducer(
					initialState,
					setEvaluationToStore(mockEvaluation)
				);

				expect(newState.userEvaluations).toHaveLength(1);
				expect(newState.userEvaluations[0].evaluationId).toBe(mockEvaluation.evaluationId);
			});

			it('should update existing evaluation', () => {
				const stateWithEvaluation = {
					...initialState,
					userEvaluations: [mockEvaluation],
				};
				const updatedEvaluation = { ...mockEvaluation, evaluation: 0.8 };

				const newState = evaluationsSlicer.reducer(
					stateWithEvaluation,
					setEvaluationToStore(updatedEvaluation)
				);

				expect(newState.userEvaluations).toHaveLength(1);
				expect(newState.userEvaluations[0].evaluation).toBe(0.8);
			});

			it('should add multiple different evaluations', () => {
				let state = initialState;
				state = evaluationsSlicer.reducer(state, setEvaluationToStore(mockEvaluation));
				state = evaluationsSlicer.reducer(
					state,
					setEvaluationToStore({ ...mockEvaluation, evaluationId: 'eval-456' })
				);

				expect(state.userEvaluations).toHaveLength(2);
			});

			it('should preserve existing evaluations when adding new', () => {
				const stateWithEvaluation = {
					...initialState,
					userEvaluations: [mockEvaluation],
				};
				const newEvaluation = {
					...mockEvaluation,
					evaluationId: 'eval-789',
					statementId: 'stmt-789',
				};

				const newState = evaluationsSlicer.reducer(
					stateWithEvaluation,
					setEvaluationToStore(newEvaluation)
				);

				expect(newState.userEvaluations).toHaveLength(2);
				expect(newState.userEvaluations.find(e => e.evaluationId === 'eval-123')).toBeDefined();
				expect(newState.userEvaluations.find(e => e.evaluationId === 'eval-789')).toBeDefined();
			});
		});

		describe('resetEvaluations', () => {
			it('should clear all evaluations', () => {
				const stateWithEvaluations = {
					...initialState,
					userEvaluations: [
						mockEvaluation,
						{ ...mockEvaluation, evaluationId: 'eval-456' },
					],
				};

				const newState = evaluationsSlicer.reducer(stateWithEvaluations, resetEvaluations());

				expect(newState.userEvaluations).toHaveLength(0);
			});

			it('should do nothing on empty state', () => {
				const newState = evaluationsSlicer.reducer(initialState, resetEvaluations());

				expect(newState.userEvaluations).toHaveLength(0);
			});
		});
	});

	describe('selectors', () => {
		const mockRootState = {
			evaluations: {
				userEvaluations: [
					mockEvaluation,
					{
						evaluationId: 'eval-456',
						statementId: 'stmt-456',
						parentId: 'parent-123',
						evaluatorId: 'user-123',
						evaluation: 1,
						updatedAt: Date.now(),
					},
					{
						evaluationId: 'eval-789',
						statementId: 'stmt-789',
						parentId: 'parent-456',
						evaluatorId: 'user-456',
						evaluation: -0.5,
						updatedAt: Date.now(),
					},
				],
			},
			creator: {
				creator: { uid: 'user-123' },
			},
		};

		describe('evaluationsSelector', () => {
			it('should return all evaluations', () => {
				const result = evaluationsSelector(mockRootState as Parameters<typeof evaluationsSelector>[0]);
				expect(result).toHaveLength(3);
			});
		});

		describe('evaluationsParentSelector', () => {
			it('should return evaluations for a specific parent', () => {
				const selector = evaluationsParentSelector('parent-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toHaveLength(2);
				expect(result.every(e => e.parentId === 'parent-123')).toBe(true);
			});

			it('should return empty array for non-existent parent', () => {
				const selector = evaluationsParentSelector('non-existent');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toHaveLength(0);
			});

			it('should return empty array for undefined parent', () => {
				const selector = evaluationsParentSelector(undefined);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toHaveLength(0);
			});
		});

		describe('evaluationSelector', () => {
			it('should return evaluation value for statement and user', () => {
				const selector = evaluationSelector('stmt-123', 'user-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBe(0.5);
			});

			it('should use creator from state if creatorId not provided', () => {
				const selector = evaluationSelector('stmt-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBe(0.5);
			});

			it('should return undefined for non-existent evaluation', () => {
				const selector = evaluationSelector('non-existent', 'user-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBeUndefined();
			});
		});

		describe('numberOfEvaluatedStatements', () => {
			it('should return count of non-evaluated statements', () => {
				const selector = numberOfEvaluatedStatements(['stmt-123', 'stmt-456', 'stmt-new']);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				// 3 statements, 2 evaluated = 1 non-evaluated
				expect(result).toBe(1);
			});

			it('should return statement count when none evaluated', () => {
				const selector = numberOfEvaluatedStatements(['new-1', 'new-2']);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBe(2);
			});

			it('should return 0 when all evaluated', () => {
				const selector = numberOfEvaluatedStatements(['stmt-123']);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBe(0);
			});
		});

		describe('userVotesInParentSelector', () => {
			it('should count positive votes (value === 1) for user in parent', () => {
				const selector = userVotesInParentSelector('parent-123', 'user-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				// Only eval-456 has evaluation === 1 in parent-123 for user-123
				expect(result).toBe(1);
			});

			it('should return 0 for undefined parentId', () => {
				const selector = userVotesInParentSelector(undefined);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBe(0);
			});

			it('should use creator from state if userId not provided', () => {
				const selector = userVotesInParentSelector('parent-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBe(1);
			});
		});

		describe('userVotedStatementsInParentSelector', () => {
			it('should return statement IDs of positive votes', () => {
				const selector = userVotedStatementsInParentSelector('parent-123', 'user-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toContain('stmt-456');
				expect(result).not.toContain('stmt-123'); // This has 0.5, not 1
			});

			it('should return empty array for undefined parentId', () => {
				const selector = userVotedStatementsInParentSelector(undefined);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toHaveLength(0);
			});
		});
	});
});
