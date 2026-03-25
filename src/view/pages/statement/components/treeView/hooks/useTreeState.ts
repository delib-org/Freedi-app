import { useState, useCallback, useEffect, useRef } from 'react';
import { Statement } from '@freedi/shared-types';
import { MAX_VISIBLE_LEVELS } from '@/constants/treeView';

interface UseTreeStateReturn {
	expandedNodes: Set<string>;
	toggleNode: (id: string) => void;
	expandNode: (id: string) => void;
	expandAll: () => void;
	collapseAll: () => void;
	isExpanded: (id: string) => boolean;
}

/**
 * Manages expand/collapse state for tree nodes.
 * Auto-expands nodes up to MAX_VISIBLE_LEVELS on initial mount.
 * Preserves user toggle state when new data arrives.
 * Auto-expands any node that newly gains children.
 */
export function useTreeState(
	childrenMap: Map<string, Statement[]>,
	rootId: string,
	defaultCollapsed?: boolean,
): UseTreeStateReturn {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
	const userToggledRef = useRef<Set<string>>(new Set());
	const prevRootIdRef = useRef<string>('');
	// Track which nodes had children last time, to detect newly-parent nodes
	const prevParentNodesRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (rootId !== prevRootIdRef.current) {
			userToggledRef.current = new Set();
			prevParentNodesRef.current = new Set();
			prevRootIdRef.current = rootId;
		}

		// Find which nodes currently have children
		const currentParentNodes = new Set<string>();
		childrenMap.forEach((children, parentId) => {
			if (children.length > 0) {
				currentParentNodes.add(parentId);
			}
		});

		// Detect nodes that just became parents (had no children before)
		const newlyParentNodes = new Set<string>();
		currentParentNodes.forEach((id) => {
			if (!prevParentNodesRef.current.has(id)) {
				newlyParentNodes.add(id);
			}
		});
		prevParentNodesRef.current = currentParentNodes;

		// Compute which nodes should be auto-expanded (within top N levels)
		const autoExpanded = new Set<string>();

		if (!defaultCollapsed) {
			function expandToDepth(parentId: string, depth: number) {
				if (depth >= MAX_VISIBLE_LEVELS) return;
				autoExpanded.add(parentId);

				const children = childrenMap.get(parentId) || [];
				children.forEach((child) => {
					expandToDepth(child.statementId, depth + 1);
				});
			}

			expandToDepth(rootId, -1);
		}

		setExpandedNodes((prev) => {
			const next = new Set<string>();

			// Auto-expand nodes within the initial depth range
			autoExpanded.forEach((id) => {
				if (!userToggledRef.current.has(id)) {
					next.add(id);
				} else if (prev.has(id)) {
					next.add(id);
				}
			});

			// Preserve user-expanded nodes outside auto-expand range
			prev.forEach((id) => {
				if (userToggledRef.current.has(id) && !autoExpanded.has(id)) {
					next.add(id);
				}
			});

			// Auto-expand any node that just gained children for the first time
			newlyParentNodes.forEach((id) => {
				if (!userToggledRef.current.has(id)) {
					next.add(id);
				}
			});

			return next;
		});
	}, [childrenMap, rootId]);

	const toggleNode = useCallback((id: string) => {
		userToggledRef.current.add(id);
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

	const expandNode = useCallback((id: string) => {
		setExpandedNodes((prev) => {
			if (prev.has(id)) return prev;
			const next = new Set(prev);
			next.add(id);

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

	return { expandedNodes, toggleNode, expandNode, expandAll, collapseAll, isExpanded };
}
