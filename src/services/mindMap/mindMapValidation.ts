import { MindMapNode, MindMapData } from './types';
import { logError } from '@/utils/errorHandling';
import { MINDMAP_CONFIG } from '@/constants/mindMap';

export interface ValidationResult {
	isValid: boolean;
	issues: ValidationIssue[];
	stats: {
		totalNodes: number;
		maxDepth: number;
		orphanedNodes: number;
		circularReferences: number;
	};
}

export interface ValidationIssue {
	type: 'circular_reference' | 'orphaned_node' | 'depth_violation' | 'validation_error';
	statementId: string;
	message: string;
}

/**
 * Validate mind-map hierarchy for issues like circular references, orphans, and depth violations
 */
export async function validateHierarchy(
	data: MindMapData,
	statementId: string,
): Promise<ValidationResult> {
	try {
		const issues: ValidationIssue[] = [];

		// Check for circular references
		const checkCircular = (node: MindMapNode, path: string[] = []) => {
			if (path.includes(node.statement.statementId)) {
				issues.push({
					type: 'circular_reference',
					statementId: node.statement.statementId,
					message: `Circular reference detected: ${path.join(' -> ')} -> ${node.statement.statementId}`,
				});

				return;
			}

			const newPath = [...path, node.statement.statementId];

			node.children.forEach((child) => {
				checkCircular(child, newPath);
			});
		};

		checkCircular(data.tree);

		// Check for orphaned nodes
		data.allStatements.forEach((stmt) => {
			if (stmt.parentId && !data.nodeMap.has(stmt.parentId)) {
				issues.push({
					type: 'orphaned_node',
					statementId: stmt.statementId,
					message: `Node has non-existent parent: ${stmt.parentId}`,
				});
			}
		});

		// Check for depth violations
		const maxDepthViolations = findDepthViolations(data.tree, MINDMAP_CONFIG.TREE.MAX_DEPTH);
		issues.push(...maxDepthViolations);

		return {
			isValid: issues.length === 0,
			issues,
			stats: {
				totalNodes: data.nodeMap.size,
				maxDepth: calculateMaxDepth(data.tree),
				orphanedNodes: issues.filter((i) => i.type === 'orphaned_node').length,
				circularReferences: issues.filter((i) => i.type === 'circular_reference').length,
			},
		};
	} catch (error) {
		logError(error, {
			operation: 'mindMapValidation.validateHierarchy',
			statementId,
		});

		return {
			isValid: false,
			issues: [
				{
					type: 'validation_error',
					statementId,
					message: 'Failed to validate hierarchy',
				},
			],
			stats: {
				totalNodes: 0,
				maxDepth: 0,
				orphanedNodes: 0,
				circularReferences: 0,
			},
		};
	}
}

/**
 * Find depth violations in tree
 */
export function findDepthViolations(
	node: MindMapNode,
	maxDepth: number,
	issues: ValidationIssue[] = [],
): ValidationIssue[] {
	if (node.depth > maxDepth) {
		issues.push({
			type: 'depth_violation',
			statementId: node.statement.statementId,
			message: `Node exceeds maximum depth: ${node.depth} > ${maxDepth}`,
		});
	}

	node.children.forEach((child) => {
		findDepthViolations(child, maxDepth, issues);
	});

	return issues;
}

/**
 * Calculate maximum depth of tree
 */
export function calculateMaxDepth(node: MindMapNode): number {
	if (node.children.length === 0) {
		return node.depth;
	}

	return Math.max(...node.children.map((child) => calculateMaxDepth(child)));
}
