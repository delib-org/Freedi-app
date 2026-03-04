import { useState, useCallback, useEffect } from 'react';
import { Statement } from '@freedi/shared-types';
import { MAX_VISIBLE_LEVELS } from '@/constants/treeView';

interface UseTreeStateReturn {
	expandedNodes: Set<string>;
	toggleNode: (id: string) => void;
	expandAll: () => void;
	collapseAll: () => void;
	isExpanded: (id: string) => boolean;
}

/**
 * Manages expand/collapse state for tree nodes.
 * Auto-expands nodes up to MAX_VISIBLE_LEVELS on mount.
 */
export function useTreeState(
	childrenMap: Map<string, Statement[]>,
	rootId: string,
): UseTreeStateReturn {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

	// Auto-expand nodes so that the top MAX_VISIBLE_LEVELS of visible content are open.
	// The root node itself is not rendered, so we start counting from -1 to ensure
	// 3 visible levels of children are expanded.
	useEffect(() => {
		const initialExpanded = new Set<string>();

		function expandToDepth(parentId: string, depth: number) {
			if (depth >= MAX_VISIBLE_LEVELS) return;
			initialExpanded.add(parentId);

			const children = childrenMap.get(parentId) || [];
			children.forEach((child) => {
				expandToDepth(child.statementId, depth + 1);
			});
		}

		// Start at -1 so the root doesn't count as a visible level
		expandToDepth(rootId, -1);
		setExpandedNodes(initialExpanded);
	}, [childrenMap, rootId]);

	const toggleNode = useCallback((id: string) => {
		setExpandedNodes((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}

			return next;
		});
	}, []);

	const expandAll = useCallback(() => {
		const allIds = new Set<string>();
		childrenMap.forEach((_, key) => {
			allIds.add(key);
		});
		setExpandedNodes(allIds);
	}, [childrenMap]);

	const collapseAll = useCallback(() => {
		setExpandedNodes(new Set());
	}, []);

	const isExpanded = useCallback((id: string) => expandedNodes.has(id), [expandedNodes]);

	return { expandedNodes, toggleNode, expandAll, collapseAll, isExpanded };
}
