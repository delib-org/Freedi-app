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

			// Build a parentId lookup for all statements
			const byParent = new Map<string, Statement[]>();
			const byId = new Map<string, Statement>();
			statements.forEach((stmt) => {
				byId.set(stmt.statementId, stmt);
				if (stmt.parentId) {
					const siblings = byParent.get(stmt.parentId) || [];
					siblings.push(stmt);
					byParent.set(stmt.parentId, siblings);
				}
			});

			// Flood-fill: start from root, walk down to collect all descendants
			const treeIds = new Set<string>();
			treeIds.add(statementId);

			// Also include statements with topParentId matching (fast path)
			statements.forEach((stmt) => {
				if (stmt.topParentId === statementId) {
					treeIds.add(stmt.statementId);
				}
			});

			// Walk children to catch statements missing topParentId
			let frontier = [statementId];
			while (frontier.length > 0) {
				const nextFrontier: string[] = [];
				for (const parentId of frontier) {
					const children = byParent.get(parentId);
					if (children) {
						for (const child of children) {
							if (!treeIds.has(child.statementId)) {
								treeIds.add(child.statementId);
								nextFrontier.push(child.statementId);
							}
						}
					}
				}
				frontier = nextFrontier;
			}

			// Build parent-child map from tree members
			treeIds.forEach((id) => {
				const stmt = byId.get(id);
				if (stmt?.parentId && treeIds.has(stmt.parentId)) {
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
