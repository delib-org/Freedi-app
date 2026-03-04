import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/redux/store';
import { Statement } from '@freedi/shared-types';

/**
 * Creates a memoized selector that builds a childrenMap for tree view rendering.
 * Groups all statements by parentId for O(1) child lookups.
 */
export const createTreeViewSelector = () => {
	let cachedChildrenMap: Map<string, Statement[]> | null = null;
	let lastStatementsLength = 0;

	return createSelector(
		[
			(state: RootState) => state.statements.statements,
			(_: RootState, statementId: string) => statementId,
		],
		(statements, statementId) => {
			if (!cachedChildrenMap || statements.length !== lastStatementsLength) {
				cachedChildrenMap = new Map<string, Statement[]>();
				lastStatementsLength = statements.length;

				// Build parent-child map in single pass O(n)
				statements.forEach((stmt) => {
					if (stmt.parentId) {
						const siblings = cachedChildrenMap!.get(stmt.parentId) || [];
						siblings.push(stmt);
						cachedChildrenMap!.set(stmt.parentId, siblings);
					}
				});

				// Sort each group by createdAt ascending
				cachedChildrenMap.forEach((children, key) => {
					cachedChildrenMap!.set(
						key,
						children.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
					);
				});
			}

			// Get direct children of root
			const rootChildren = cachedChildrenMap.get(statementId) || [];

			return {
				childrenMap: cachedChildrenMap,
				rootChildren,
			};
		},
	);
};
