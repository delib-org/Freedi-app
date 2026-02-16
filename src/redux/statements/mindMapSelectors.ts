import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/redux/store';
import { Statement, StatementType } from '@freedi/shared-types';
import { MINDMAP_CONFIG } from '@/constants/mindMap';

/**
 * Memoized selector for mind-map statements with optimized caching
 */
export const createMindMapSelector = () => {
	// Cache for statement maps to avoid recreation
	let cachedStatementMap: Map<string, Statement> | null = null;
	let cachedChildrenMap: Map<string, Statement[]> | null = null;
	let lastStatementsLength = 0;

	return createSelector(
		[
			(state: RootState) => state.statements.statements,
			(_: RootState, statementId: string) => statementId,
		],
		(statements, statementId) => {
			// Only rebuild maps if statements array changed
			if (!cachedStatementMap || statements.length !== lastStatementsLength) {
				cachedStatementMap = new Map<string, Statement>();
				cachedChildrenMap = new Map<string, Statement[]>();
				lastStatementsLength = statements.length;

				// Build maps in single pass O(n)
				statements.forEach((stmt) => {
					cachedStatementMap!.set(stmt.statementId, stmt);

					// Build parent-child relationships
					if (stmt.parentId) {
						const siblings = cachedChildrenMap!.get(stmt.parentId) || [];
						siblings.push(stmt);
						cachedChildrenMap!.set(stmt.parentId, siblings);
					}
				});
			}

			// Get root statement
			const rootStatement = cachedStatementMap.get(statementId);
			if (!rootStatement) {
				return null;
			}

			// Get all descendants efficiently using parents array
			const descendants = statements.filter(
				(stmt) => stmt.parents?.includes(statementId) && isValidMindMapStatement(stmt),
			);

			return {
				rootStatement,
				descendants,
				statementMap: cachedStatementMap,
				childrenMap: cachedChildrenMap,
			};
		},
	);
};

/**
 * Selector for mind-map tree structure with optimized building
 */
export const createMindMapTreeSelector = () => {
	const getMindMapData = createMindMapSelector();

	return createSelector([getMindMapData], (data) => {
		if (!data) return null;

		const { rootStatement, childrenMap } = data;

		// Build tree using cached maps (no filtering needed)
		function buildNode(statement: Statement, depth: number = 0): MindMapNode {
			// Prevent infinite loops
			if (depth > MINDMAP_CONFIG.TREE.MAX_DEPTH) {
				return {
					statement,
					children: [],
					depth,
					isExpanded: false,
				};
			}

			// Get children from cached map O(1)
			const children = (childrenMap.get(statement.statementId) || [])
				.filter(isValidMindMapStatement)
				.sort(sortMindMapStatements);

			// Recursively build child nodes
			const childNodes = children.map((child) => buildNode(child, depth + 1));

			return {
				statement,
				children: childNodes,
				depth,
				isExpanded: depth < 2, // Auto-expand first 2 levels
			};
		}

		const tree = buildNode(rootStatement);

		// Create node map for quick lookups
		const nodeMap = new Map<string, MindMapNode>();
		populateNodeMap(tree, nodeMap);

		return {
			tree,
			nodeMap,
			totalNodes: nodeMap.size,
			maxDepth: calculateMaxDepth(tree),
		};
	});
};

/**
 * Selector for visible nodes (for virtual rendering)
 */
export const createVisibleNodesSelector = () => {
	const getTreeData = createMindMapTreeSelector();

	return createSelector(
		[getTreeData, (_: RootState, __: string, viewport?: Viewport) => viewport],
		(treeData, viewport) => {
			if (!treeData || !viewport) {
				return treeData?.nodeMap ? Array.from(treeData.nodeMap.values()) : [];
			}

			const visibleNodes: MindMapNode[] = [];
			const { nodeMap } = treeData;

			// Filter nodes within viewport
			nodeMap.forEach((node) => {
				if (isNodeInViewport(node, viewport)) {
					visibleNodes.push(node);
				}
			});

			return visibleNodes;
		},
	);
};

/**
 * Selector for mind-map statistics
 */
export const createMindMapStatsSelector = () => {
	const getTreeData = createMindMapTreeSelector();

	return createSelector([getTreeData], (treeData) => {
		if (!treeData) {
			return {
				totalNodes: 0,
				maxDepth: 0,
				questionCount: 0,
				groupCount: 0,
				optionCount: 0,
			};
		}

		let questionCount = 0;
		let groupCount = 0;
		let optionCount = 0;

		treeData.nodeMap.forEach((node) => {
			switch (node.statement.statementType) {
				case StatementType.question:
					questionCount++;
					break;
				case StatementType.group:
					groupCount++;
					break;
				case StatementType.option:
					optionCount++;
					break;
			}
		});

		return {
			totalNodes: treeData.totalNodes,
			maxDepth: treeData.maxDepth,
			questionCount,
			groupCount,
			optionCount,
		};
	});
};

// Helper functions
function isValidMindMapStatement(statement: Statement): boolean {
	return (
		statement.statementType === StatementType.question ||
		statement.statementType === StatementType.group ||
		statement.statementType === StatementType.option
	);
}

function sortMindMapStatements(a: Statement, b: Statement): number {
	// Sort by type priority: questions > groups > options
	const typePriority = {
		[StatementType.question]: 0,
		[StatementType.group]: 1,
		[StatementType.option]: 2,
	};

	const aPriority = typePriority[a.statementType] ?? 3;
	const bPriority = typePriority[b.statementType] ?? 3;

	if (aPriority !== bPriority) {
		return aPriority - bPriority;
	}

	// Then sort by creation date
	return (a.createdAt || 0) - (b.createdAt || 0);
}

function populateNodeMap(node: MindMapNode, map: Map<string, MindMapNode>): void {
	map.set(node.statement.statementId, node);
	node.children.forEach((child) => populateNodeMap(child, map));
}

function calculateMaxDepth(node: MindMapNode): number {
	if (node.children.length === 0) {
		return node.depth;
	}

	return Math.max(...node.children.map((child) => calculateMaxDepth(child)));
}

function isNodeInViewport(_node: MindMapNode, _viewport: Viewport): boolean {
	// This is a placeholder - actual implementation would check node position
	// against viewport bounds considering the buffer zone

	// For now, return true for all nodes
	// Real implementation would calculate based on node.position
	return true;
}

// Types
export interface MindMapNode {
	statement: Statement;
	children: MindMapNode[];
	depth: number;
	isExpanded?: boolean;
	position?: { x: number; y: number };
}

export interface Viewport {
	x: number;
	y: number;
	zoom: number;
	width: number;
	height: number;
}

export interface MindMapTreeData {
	tree: MindMapNode;
	nodeMap: Map<string, MindMapNode>;
	totalNodes: number;
	maxDepth: number;
}
