import { useMemo } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { Statement } from '@freedi/shared-types';
import { createTreeViewSelector } from '@/redux/statements/treeViewSelectors';

interface UseTreeDataReturn {
	childrenMap: Map<string, Statement[]>;
	rootChildren: Statement[];
	getChildren: (parentId: string) => Statement[];
}

const selectTreeView = createTreeViewSelector();

/**
 * Provides tree data from Redux with O(1) child lookups.
 */
export function useTreeData(statementId: string): UseTreeDataReturn {
	const { childrenMap, rootChildren } = useAppSelector((state) =>
		selectTreeView(state, statementId),
	);

	const getChildren = useMemo(() => {
		return (parentId: string): Statement[] => {
			return childrenMap.get(parentId) || [];
		};
	}, [childrenMap]);

	return { childrenMap, rootChildren, getChildren };
}
