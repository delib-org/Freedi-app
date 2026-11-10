import type { Statement } from '@freedi/shared-types';

/** A deeper tree than this is read only as far as its nearest levels and its top. */
const MAX_ANCESTORS = 12;
const TOP = 'top';

/** Nearest ancestor first, the top statement always included. */
export function ancestorIds(
	statement: Pick<Statement, 'statementId' | 'parentId' | 'parents' | 'topParentId'>,
): string[] {
	const listed = [...(statement.parents ?? []), statement.parentId].filter(
		(id) => !!id && id !== TOP && id !== statement.statementId,
	);
	const nearestFirst = [...new Set(listed)].reverse().slice(0, MAX_ANCESTORS);
	const top = statement.topParentId;
	if (top && top !== TOP && top !== statement.statementId && !nearestFirst.includes(top)) {
		nearestFirst.push(top);
	}

	return nearestFirst;
}
