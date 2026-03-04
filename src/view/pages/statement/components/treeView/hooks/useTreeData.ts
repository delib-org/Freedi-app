import { useMemo } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { Statement, StatementType } from '@freedi/shared-types';
import { createTreeViewSelector } from '@/redux/statements/treeViewSelectors';

interface UseTreeDataReturn {
	childrenMap: Map<string, Statement[]>;
	rootChildren: Statement[];
	getChildren: (parentId: string) => Statement[];
}

const selectTreeView = createTreeViewSelector();

/**
 * Provides tree data from Redux with O(1) child lookups.
 * Optionally filters by statement types.
 */
export function useTreeData(
	statementId: string,
	typeFilter?: readonly StatementType[],
): UseTreeDataReturn {
	const { childrenMap: fullChildrenMap, rootChildren: fullRootChildren } = useAppSelector((state) =>
		selectTreeView(state, statementId),
	);

	const { childrenMap, rootChildren } = useMemo(() => {
		if (!typeFilter) return { childrenMap: fullChildrenMap, rootChildren: fullRootChildren };

		const filteredMap = new Map<string, Statement[]>();
		fullChildrenMap.forEach((children, key) => {
			const filtered = children.filter((c) => typeFilter.includes(c.statementType));
			if (filtered.length > 0) filteredMap.set(key, filtered);
		});

		const filteredRoot = fullRootChildren.filter((c) => typeFilter.includes(c.statementType));

		return { childrenMap: filteredMap, rootChildren: filteredRoot };
	}, [fullChildrenMap, fullRootChildren, typeFilter]);

	const getChildren = useMemo(() => {
		return (parentId: string): Statement[] => {
			return childrenMap.get(parentId) || [];
		};
	}, [childrenMap]);

	return { childrenMap, rootChildren, getChildren };
}
