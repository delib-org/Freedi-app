import { useMemo } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { Statement, StatementType, SortType } from '@freedi/shared-types';
import { createTreeViewSelector } from '@/redux/statements/treeViewSelectors';

interface UseTreeDataReturn {
	childrenMap: Map<string, Statement[]>;
	rootChildren: Statement[];
	getChildren: (parentId: string) => Statement[];
}

export interface TreeDataOptions {
	typeFilter?: readonly StatementType[];
	sortType?: SortType;
	onlySelectedOptions?: boolean;
}

const selectTreeView = createTreeViewSelector();

function applySortToStatements(statements: Statement[], sortType: SortType): Statement[] {
	const sorted = [...statements];
	switch (sortType) {
		case SortType.newest:
			return sorted.sort((a, b) => b.createdAt - a.createdAt);
		case SortType.mostUpdated:
			return sorted.sort((a, b) => b.lastUpdate - a.lastUpdate);
		case SortType.accepted:
			return sorted.sort(
				(a, b) =>
					(b.evaluation?.agreement ?? b.consensus ?? 0) -
					(a.evaluation?.agreement ?? a.consensus ?? 0),
			);
		case SortType.random:
			return sorted.sort(() => Math.random() - 0.5);
		case SortType.mostJoined:
			return sorted.sort(
				(a, b) => (b.evaluation?.sumPro || b.pro || 0) - (a.evaluation?.sumPro || a.pro || 0),
			);
		default:
			return sorted;
	}
}

/** Find a statement by ID inside a childrenMap */
function findInMap(map: Map<string, Statement[]>, id: string): Statement | undefined {
	for (const children of map.values()) {
		const found = children.find((c) => c.statementId === id);
		if (found) return found;
	}

	return undefined;
}

/**
 * Provides tree data from Redux with O(1) child lookups.
 * Supports type filtering, sorting, and selected-only option filtering.
 */
export function useTreeData(statementId: string, options?: TreeDataOptions): UseTreeDataReturn {
	const { typeFilter, sortType, onlySelectedOptions } = options || {};

	const { childrenMap: fullChildrenMap, rootChildren: fullRootChildren } = useAppSelector((state) =>
		selectTreeView(state, statementId),
	);

	// Build set of selected option IDs from all parent statements' results
	const allStatements = useAppSelector((state) => state.statements.statements);
	const selectedOptionIds = useMemo(() => {
		if (!onlySelectedOptions) return undefined;

		const ids = new Set<string>();
		allStatements.forEach((stmt) => {
			stmt.results?.forEach((r) => ids.add(r.statementId));
		});

		return ids;
	}, [allStatements, onlySelectedOptions]);

	const { childrenMap, rootChildren } = useMemo(() => {
		let resultMap = fullChildrenMap;
		let resultRoot = fullRootChildren;

		if (typeFilter) {
			const matchesFilter = (c: Statement): boolean => {
				if (!typeFilter.includes(c.statementType)) return false;
				if (
					selectedOptionIds &&
					c.statementType === StatementType.option &&
					!selectedOptionIds.has(c.statementId)
				)
					return false;

				return true;
			};

			// Build set of all matching statement IDs
			const matchingIds = new Set<string>();
			fullChildrenMap.forEach((children) => {
				children.forEach((c) => {
					if (matchesFilter(c)) matchingIds.add(c.statementId);
				});
			});
			fullRootChildren.forEach((c) => {
				if (matchesFilter(c)) matchingIds.add(c.statementId);
			});

			// Build filtered childrenMap: only keep matching children,
			// and only under matching parents
			resultMap = new Map<string, Statement[]>();
			fullChildrenMap.forEach((children, parentId) => {
				if (!matchingIds.has(parentId)) return;
				const filtered = children.filter((c) => matchingIds.has(c.statementId));
				if (filtered.length > 0) resultMap.set(parentId, filtered);
			});

			// Root children: matching items from root level + matching items
			// whose parent is NOT a matching item (promote orphans)
			const childOfMatchingParent = new Set<string>();
			resultMap.forEach((children) => {
				children.forEach((c) => childOfMatchingParent.add(c.statementId));
			});

			resultRoot = [];
			matchingIds.forEach((id) => {
				if (!childOfMatchingParent.has(id)) {
					// Find the statement object
					const found =
						fullRootChildren.find((c) => c.statementId === id) ||
						findInMap(fullChildrenMap, id);
					if (found) resultRoot.push(found);
				}
			});
		} else if (selectedOptionIds) {
			resultMap = new Map<string, Statement[]>();
			fullChildrenMap.forEach((children, key) => {
				const filtered = children.filter((c) => {
					if (
						c.statementType === StatementType.option &&
						!selectedOptionIds.has(c.statementId)
					)
						return false;

					return true;
				});
				if (filtered.length > 0) resultMap.set(key, filtered);
			});
			resultRoot = fullRootChildren.filter((c) => {
				if (
					c.statementType === StatementType.option &&
					!selectedOptionIds.has(c.statementId)
				)
					return false;

				return true;
			});
		}

		// Apply sorting
		if (sortType) {
			const sortedMap = new Map<string, Statement[]>();
			resultMap.forEach((children, key) => {
				sortedMap.set(key, applySortToStatements(children, sortType));
			});
			resultRoot = applySortToStatements(resultRoot, sortType);
			resultMap = sortedMap;
		}

		return { childrenMap: resultMap, rootChildren: resultRoot };
	}, [fullChildrenMap, fullRootChildren, typeFilter, sortType, selectedOptionIds]);

	const getChildren = useMemo(() => {
		return (parentId: string): Statement[] => {
			return childrenMap.get(parentId) || [];
		};
	}, [childrenMap]);

	return { childrenMap, rootChildren, getChildren };
}
