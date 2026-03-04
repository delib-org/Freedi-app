import { useState, useCallback, useEffect, useRef } from 'react';
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
 * Auto-expands nodes up to MAX_VISIBLE_LEVELS on initial mount.
 * Preserves user toggle state when new data arrives.
 */
export function useTreeState(
	childrenMap: Map<string, Statement[]>,
	rootId: string,
): UseTreeStateReturn {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
	// Track which nodes the user has manually toggled so we don't override them
	const userToggledRef = useRef<Set<string>>(new Set());
	const prevRootIdRef = useRef<string>('');

	useEffect(() => {
		// When navigating to a different root, reset everything
		if (rootId !== prevRootIdRef.current) {
			userToggledRef.current = new Set();
			prevRootIdRef.current = rootId;
		}

		// Compute which nodes should be auto-expanded (within top N levels)
		const autoExpanded = new Set<string>();

		function expandToDepth(parentId: string, depth: number) {
			if (depth >= MAX_VISIBLE_LEVELS) return;
			autoExpanded.add(parentId);

			const children = childrenMap.get(parentId) || [];
			children.forEach((child) => {
				expandToDepth(child.statementId, depth + 1);
			});
		}

		// Start at -1 so the root doesn't count as a visible level
		expandToDepth(rootId, -1);

		setExpandedNodes((prev) => {
			const next = new Set<string>();

			// For each node that should be auto-expanded:
			// only add it if the user hasn't manually toggled it
			autoExpanded.forEach((id) => {
				if (!userToggledRef.current.has(id)) {
					next.add(id);
				} else {
					// User toggled this node - preserve their choice
					if (prev.has(id)) {
						next.add(id);
					}
				}
			});

			// Also preserve any user-expanded nodes outside auto-expand range
			prev.forEach((id) => {
				if (userToggledRef.current.has(id) && !autoExpanded.has(id)) {
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
