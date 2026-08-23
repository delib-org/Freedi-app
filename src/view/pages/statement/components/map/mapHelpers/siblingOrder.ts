import { Statement } from '@freedi/shared-types';

/**
 * Siblings render in the position the user dragged them to, but only once at
 * least one of them carries an explicit `order`. Maps that were never reordered
 * keep the incoming array order, so nothing shifts under existing users; the
 * first drag renumbers a whole sibling set, after which the sort takes over.
 */
export function sortSiblings<T>(items: T[], statementOf: (item: T) => Statement): T[] {
	const hasExplicitOrder = items.some((item) => typeof statementOf(item).order === 'number');
	if (!hasExplicitOrder) return items;

	return [...items].sort(
		(a, b) =>
			(statementOf(a).order ?? Number.MAX_SAFE_INTEGER) -
			(statementOf(b).order ?? Number.MAX_SAFE_INTEGER),
	);
}
