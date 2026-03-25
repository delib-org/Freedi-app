import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/redux/store';
import { Statement } from '@freedi/shared-types';

/**
 * Creates a memoized selector that builds a childrenMap for tree view rendering.
 * Groups all statements by parentId for O(1) child lookups.
 */
export const createTreeViewSelector = () => {
	return createSelector(
		[
			(state: RootState) => state.statements.statements,
			(_: RootState, statementId: string) => statementId,
		],
		(statements, statementId) => {
			const childrenMap = new Map<string, Statement[]>();

			// Only include statements belonging to this tree (matching topParentId or direct children)
			// This avoids iterating 500+ accumulated statements from other rooms
			const treeStatements = statements.filter(
				(stmt) => stmt.topParentId === statementId || stmt.parentId === statementId,
			);

			// Build parent-child map in single pass O(n)
			treeStatements.forEach((stmt) => {
				if (stmt.parentId) {
					const siblings = childrenMap.get(stmt.parentId) || [];
					siblings.push(stmt);
					childrenMap.set(stmt.parentId, siblings);
				}
			});

			// Sort each group by createdAt ascending
			childrenMap.forEach((children, key) => {
				childrenMap.set(
					key,
					children.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
				);
			});

			// Get direct children of root
			const rootChildren = childrenMap.get(statementId) || [];

			return {
				childrenMap,
				rootChildren,
			};
		},
	);
};
