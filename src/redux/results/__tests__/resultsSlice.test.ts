/**
 * Tests for resultsSlice Redux store
 */

import { Results, Statement } from '@freedi/shared-types';
import {
	resultsSlice,
	setResults,
	resetResults,
	resultSelector,
} from '../resultsSlice';

describe('resultsSlice', () => {
	const mockStatement: Partial<Statement> = {
		statementId: 'stmt-123',
		statement: 'Test statement',
		consensus: 0.8,
	};

	const mockResults: Results = {
		top: mockStatement as Statement,
		sub: [],
	};

	const initialState = resultsSlice.getInitialState();

	describe('reducers', () => {
		describe('setResults', () => {
			// Note: The current implementation is commented out
			// These tests verify the expected behavior if implemented
			it('should not throw on dispatch', () => {
				expect(() => {
					resultsSlice.reducer(initialState, setResults());
				}).not.toThrow();
			});

			it('should return state unchanged (current implementation)', () => {
				const newState = resultsSlice.reducer(initialState, setResults());
				expect(newState.results).toEqual(initialState.results);
			});
		});

		describe('resetResults', () => {
			it('should clear all results', () => {
				const stateWithResults = {
					...initialState,
					results: [mockResults],
				};

				const newState = resultsSlice.reducer(stateWithResults, resetResults());

				expect(newState.results).toHaveLength(0);
			});

			it('should do nothing on empty state', () => {
				const newState = resultsSlice.reducer(initialState, resetResults());

				expect(newState.results).toHaveLength(0);
			});

			it('should clear multiple results', () => {
				const stateWithResults = {
					...initialState,
					results: [
						mockResults,
						{
							top: { ...mockStatement, statementId: 'stmt-456' } as Statement,
							sub: [],
						},
					],
				};

				const newState = resultsSlice.reducer(stateWithResults, resetResults());

				expect(newState.results).toHaveLength(0);
			});
		});
	});

	describe('selectors', () => {
		const mockRootState = {
			results: {
				results: [
					mockResults,
					{
						top: { ...mockStatement, statementId: 'stmt-456' } as Statement,
						sub: [],
					},
				],
			},
		};

		describe('resultSelector', () => {
			it('should return result by top statement ID', () => {
				const selector = resultSelector('stmt-123');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result?.top.statementId).toBe('stmt-123');
			});

			it('should return undefined for non-existent ID', () => {
				const selector = resultSelector('non-existent');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBeUndefined();
			});

			it('should return undefined for undefined ID', () => {
				const selector = resultSelector(undefined);
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result).toBeUndefined();
			});

			it('should find specific result among multiple', () => {
				const selector = resultSelector('stmt-456');
				const result = selector(mockRootState as Parameters<typeof selector>[0]);
				expect(result?.top.statementId).toBe('stmt-456');
			});
		});
	});

	describe('initial state', () => {
		it('should have empty results array', () => {
			expect(initialState.results).toEqual([]);
		});
	});

	describe('slice name', () => {
		it('should have correct name', () => {
			expect(resultsSlice.name).toBe('results');
		});
	});

	describe('action creators', () => {
		it('setResults should create correct action', () => {
			const action = setResults();
			expect(action.type).toBe('results/setResults');
		});

		it('resetResults should create correct action', () => {
			const action = resetResults();
			expect(action.type).toBe('results/resetResults');
		});
	});
});
