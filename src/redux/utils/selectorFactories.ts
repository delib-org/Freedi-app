/**
 * Redux Selector Factories
 *
 * Reusable selector patterns to reduce duplication across Redux slices.
 * Uses generic state types to avoid circular dependencies with store.ts.
 */

import { createSelector } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';

// Generic state selector type - avoids importing RootState and creating circular dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StateSelector<T> = (state: any) => T;

/**
 * Create a selector that filters statements by parent ID
 */
export function createStatementsByParentSelector(selectStatements: StateSelector<Statement[]>) {
	return (parentId: string | undefined) =>
		createSelector([selectStatements], (statements) =>
			statements
				.filter((statement) => statement.parentId === parentId)
				.sort((a, b) => a.createdAt - b.createdAt),
		);
}

/**
 * Create a selector that filters statements by parent ID and type
 */
export function createStatementsByParentAndTypeSelector(
	selectStatements: StateSelector<Statement[]>,
) {
	return (parentId: string | undefined, statementType: StatementType) =>
		createSelector([selectStatements], (statements) =>
			statements
				.filter(
					(statement) =>
						statement.parentId === parentId && statement.statementType === statementType,
				)
				.sort((a, b) => a.createdAt - b.createdAt),
		);
}

/**
 * Create a selector that finds a statement by ID
 */
export function createStatementByIdSelector(selectStatements: StateSelector<Statement[]>) {
	return (statementId: string | undefined) =>
		createSelector([selectStatements], (statements) =>
			statements.find((statement) => statement.statementId === statementId),
		);
}

/**
 * Create a selector that filters statements by top parent ID
 */
export function createStatementsByTopParentSelector(selectStatements: StateSelector<Statement[]>) {
	return (topParentId: string | undefined) =>
		createSelector([selectStatements], (statements) =>
			statements.filter((statement) => statement.topParentId === topParentId),
		);
}

/**
 * Create a selector that filters and sorts by a custom predicate
 */
export function createFilteredStatementsSelector(selectStatements: StateSelector<Statement[]>) {
	return (
		predicate: (statement: Statement) => boolean,
		sortFn?: (a: Statement, b: Statement) => number,
	) =>
		createSelector([selectStatements], (statements) => {
			const filtered = statements.filter(predicate);

			return sortFn ? filtered.sort(sortFn) : filtered;
		});
}

/**
 * Common sort functions
 */
export const sortByCreatedAt = (a: Statement, b: Statement): number => a.createdAt - b.createdAt;

export const sortByLastUpdate = (a: Statement, b: Statement): number => b.lastUpdate - a.lastUpdate;

export const sortByConsensus = (a: Statement, b: Statement): number =>
	(b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0);

export const sortByEvaluationCount = (a: Statement, b: Statement): number =>
	(b.evaluation?.numberOfEvaluators || 0) - (a.evaluation?.numberOfEvaluators || 0);

/**
 * Create a memoized selector for counting items
 */
export function createCountSelector<T>(selectItems: StateSelector<T[]>) {
	return createSelector([selectItems], (items) => items.length);
}

/**
 * Create a selector that checks if an item exists
 */
export function createExistsSelector<T>(selectItems: StateSelector<T[]>, idKey: keyof T) {
	return (id: string | undefined) =>
		createSelector([selectItems], (items) => items.some((item) => item[idKey] === id));
}
