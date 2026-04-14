import { Statement, StatementType } from '@freedi/shared-types';

/**
 * Walks the statement's ancestry until it finds the nearest ancestor of
 * type `StatementType.question`. An option may be nested under another
 * option that was promoted to a sub-question (see `promoteOptionToSubQuestion`),
 * so we can't assume `parentId` points directly to a question.
 *
 * Returns the owning question, or `undefined` if none is found (no ancestor
 * of question type is present in the provided statements list, or the chain
 * is broken because an intermediate statement isn't cached).
 *
 * The second argument is an array (matching `state.statements.statements`)
 * rather than a Map so it can be passed straight from the Redux store without
 * any transformation. Callers with a large cache should preload a Map and
 * wrap it with `getOwningQuestionByLookup` for O(1) lookups.
 */
export function getOwningQuestion(
	statement: Statement | undefined,
	statements: readonly Statement[],
): Statement | undefined {
	if (!statement) return undefined;
	const lookup = (id: string): Statement | undefined =>
		statements.find((s) => s.statementId === id);

	return getOwningQuestionByLookup(statement, lookup);
}

export function getOwningQuestionByLookup(
	statement: Statement | undefined,
	lookup: (statementId: string) => Statement | undefined,
): Statement | undefined {
	if (!statement) return undefined;

	// If the statement itself is a question, it is its own owner.
	if (statement.statementType === StatementType.question) {
		return statement;
	}

	const visited = new Set<string>();
	let current: Statement | undefined = statement;

	while (current && current.parentId && !visited.has(current.statementId)) {
		visited.add(current.statementId);
		const parent = lookup(current.parentId);
		if (!parent) return undefined; // chain broken
		if (parent.statementType === StatementType.question) return parent;
		current = parent;
	}

	return undefined;
}

export function getOwningQuestionId(
	statement: Statement | undefined,
	statements: readonly Statement[],
): string | undefined {
	return getOwningQuestion(statement, statements)?.statementId;
}
