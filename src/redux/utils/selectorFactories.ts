/**
 * Redux Selector Factories
 *
 * Reusable selector patterns to reduce duplication across Redux slices.
 * Uses generic state types to avoid circular dependencies with store.ts.
 */

import { createSelector } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import { isDocumentBodyParagraph } from '@/helpers/statementTypeHelpers';

// Generic state selector type - avoids importing RootState and creating circular dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StateSelector<T> = (state: any) => T;

/**
 * Create a selector that filters statements by parent ID.
 *
 * Paragraph children are excluded: they are the parent's rich body content
 * (rendered by StatementBody), not discussable list members — including them
 * would leak body paragraphs into chat feeds, tab counts, and child lists.
 * This covers both canonical `paragraph`-typed children and Sign's legacy
 * option-typed official paragraphs (`doc.isOfficialParagraph`) — see
 * isDocumentBodyParagraph.
 */
export function createStatementsByParentSelector(selectStatements: StateSelector<Statement[]>) {
	return (parentId: string | undefined) =>
		createSelector([selectStatements], (statements) =>
			statements
				.filter(
					(statement) => statement.parentId === parentId && !isDocumentBodyParagraph(statement),
				)
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

/**
 * Resolve a statement's consensus score for sorting.
 *
 * The live pipeline + cluster aggregator write `evaluation.agreement` and the
 * top-level `consensus` to the same value, but they can diverge for legacy /
 * partially-migrated docs. A plain `evaluation.agreement ?? consensus` is
 * unsafe: `??` only falls back on null/undefined, so a stale `agreement: 0`
 * would mask a real `consensus` and flatten the order. Prefer the field that
 * actually carries signal: use `evaluation.agreement` when it's a non-zero
 * number, otherwise fall back to `consensus` (then 0).
 */
export const getConsensusScore = (statement: Statement): number => {
	const agreement = statement.evaluation?.agreement;
	if (typeof agreement === 'number' && agreement !== 0) return agreement;

	return statement.consensus ?? agreement ?? 0;
};

export const sortByConsensus = (a: Statement, b: Statement): number =>
	getConsensusScore(b) - getConsensusScore(a);

export const sortByEvaluationCount = (a: Statement, b: Statement): number =>
	(b.evaluation?.numberOfEvaluators || 0) - (a.evaluation?.numberOfEvaluators || 0);

/**
 * Create a memoized selector for counting items
 */
export function createCountSelector<T>(selectItems: StateSelector<T[]>) {
	return createSelector([selectItems], (items) => items.length);
}

/**
 * Create a memoized selector that counts items matching a predicate.
 * Returns a primitive, so useSelector subscribers only re-render when the
 * count itself changes — not on every unrelated dispatch. Instantiate once
 * per component instance (wrap in useMemo keyed by the predicate inputs).
 */
export function createPredicateCountSelector<T>(selectItems: StateSelector<T[]>) {
	return (predicate: (item: T) => boolean) =>
		createSelector([selectItems], (items) => items.filter(predicate).length);
}

/**
 * Create a selector that checks if an item exists
 */
export function createExistsSelector<T>(selectItems: StateSelector<T[]>, idKey: keyof T) {
	return (id: string | undefined) =>
		createSelector([selectItems], (items) => items.some((item) => item[idKey] === id));
}
