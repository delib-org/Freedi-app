import { Results, Statement, StatementType } from '@freedi/shared-types';
import { NodeObj, MindElixirData } from 'mind-elixir';

/**
 * Style configuration for MindElixir nodes based on statement type
 */
interface MindElixirNodeStyle {
	background: string;
	color: string;
	fontSize?: string;
	fontWeight?: string;
}

/**
 * The two kinds of cluster node we visualize distinctly in the mind map.
 * - `synth`: a merge of near-duplicate options into one unified voice (members hidden).
 * - `topic`: a theme grouping related-but-distinct options (members visible as children).
 */
export type ClusterKind = 'synth' | 'topic';

/**
 * Formats the count badge shown on a cluster node (e.g. "5 merged" / "7 grouped").
 * Injected by the caller so the wording can be translated.
 */
export type ClusterTagFormatter = (kind: ClusterKind, count: number) => string;

const defaultClusterTagFormatter: ClusterTagFormatter = (kind, count) =>
	kind === 'synth' ? `${count} merged` : `${count} grouped`;

/**
 * Determine whether a statement is a cluster node and, if so, which kind.
 * Synthesis-pipeline merges read as "synth"; everything else that is a cluster
 * (topic detection, manual grouping) reads as a "topic" theme.
 */
export function getClusterKind(statement: Statement): ClusterKind | null {
	if (!statement.isCluster) return null;

	return statement.derivedByPipeline === 'synthesis' ? 'synth' : 'topic';
}

/**
 * Inline style for a cluster node. Colors come from design tokens so light/high-contrast
 * modes are handled by the stylesheet. The decorative glow/accent bar is applied via CSS
 * (`me-tpc:has(.cluster-tag--*)`) keyed off the node's tag class.
 */
function getClusterStyle(kind: ClusterKind): MindElixirNodeStyle {
	if (kind === 'synth') {
		return {
			background: 'var(--cluster-synth-bg)',
			color: 'var(--cluster-synth-text)',
			fontWeight: '600',
		};
	}

	return {
		background: 'var(--cluster-topic-bg)',
		color: 'var(--cluster-topic-text)',
		fontWeight: '600',
	};
}

/**
 * Attach the cluster icon, count badge, and (for topics) branch color to a node.
 */
function decorateClusterNode(
	node: FreediNodeObj,
	kind: ClusterKind,
	statement: Statement,
	result: Results,
	format: ClusterTagFormatter,
): void {
	if (kind === 'synth') {
		node.icons = ['✦'];
		const count = statement.integratedOptions?.length ?? 0;
		// A "merge of one" carries no information — only badge real merges.
		if (count >= 2) {
			node.tags = [{ text: format('synth', count), className: 'cluster-tag cluster-tag--synth' }];
		}

		return;
	}

	node.icons = ['#'];
	const count = statement.integratedOptions?.length ?? result.sub?.length ?? 0;
	if (count >= 1) {
		node.tags = [{ text: format('topic', count), className: 'cluster-tag cluster-tag--topic' }];
	}
	// Tie the visible member branch to its topic header.
	node.branchColor = '#6f8ce8';
}

/**
 * Get the CSS variable-based style for a statement type
 * Uses existing design system colors from style.scss
 */
export function getStyleForType(
	statementType: StatementType | undefined,
	isSelected?: boolean,
): MindElixirNodeStyle {
	switch (statementType) {
		case StatementType.question:
			return {
				background: '#47b4ef', // --header-question
				color: '#ffffff', // --question-text
			};
		case StatementType.option:
			return {
				background: isSelected
					? '#57c6b2' // --agree (green, same as options screen)
					: '#ffe16a', // --header-not-chosen (yellow)
				color: isSelected ? '#ffffff' : '#3b4f7d', // --option-text
			};
		case StatementType.group:
			return {
				background: '#b9a1e8', // --header-group
				color: '#ffffff', // --group-text
			};
		default:
			return {
				background: '#ffffff', // --card-default
				color: '#3d4d71', // --text-body
			};
	}
}

/**
 * Extended NodeObj with custom data for our app
 */
export interface FreediNodeObj extends NodeObj {
	statementType?: StatementType;
	statementId?: string;
	parentId?: string;
	isSelected?: boolean;
	clusterKind?: ClusterKind;
}

/**
 * Transform a Results tree structure to MindElixir data format
 *
 * @param results - The Results tree from useMindMap hook
 * @param selectedStatementIds - Optional array of selected statement IDs (for showing selected options)
 * @returns MindElixirData compatible with mind-elixir library
 */
export function toMindElixirData(
	results: Results,
	selectedStatementIds: string[] = [],
	formatClusterTag: ClusterTagFormatter = defaultClusterTagFormatter,
): MindElixirData {
	function transformNode(result: Results): FreediNodeObj {
		const statement = result.top;
		const clusterKind = getClusterKind(statement);
		const isSelected =
			selectedStatementIds.includes(statement.statementId) ||
			!!(statement.isVoted || statement.isChosen);
		// Cluster styling takes priority over type/selection styling.
		const style = clusterKind
			? getClusterStyle(clusterKind)
			: getStyleForType(statement.statementType, isSelected);

		const node: FreediNodeObj = {
			id: statement.statementId,
			topic: statement.statement || 'Untitled',
			style,
			statementType: statement.statementType,
			statementId: statement.statementId,
			parentId: statement.parentId,
			isSelected,
			clusterKind: clusterKind ?? undefined,
		};

		if (clusterKind) {
			decorateClusterNode(node, clusterKind, statement, result, formatClusterTag);
		}

		// Transform children recursively
		if (result.sub && result.sub.length > 0) {
			node.children = result.sub.map((subResult) => transformNode(subResult));
		}

		return node;
	}

	return {
		nodeData: transformNode(results),
	};
}

/**
 * Find a node by ID in the MindElixir data structure
 */
export function findNodeById(nodeData: FreediNodeObj, id: string): FreediNodeObj | null {
	if (nodeData.id === id) {
		return nodeData;
	}

	if (nodeData.children) {
		for (const child of nodeData.children) {
			const found = findNodeById(child as FreediNodeObj, id);
			if (found) return found;
		}
	}

	return null;
}

/**
 * Get the statement from a node
 */
export function getStatementFromNode(node: FreediNodeObj): Partial<Statement> {
	return {
		statementId: node.statementId || node.id,
		statement: node.topic,
		statementType: node.statementType,
		parentId: node.parentId,
	};
}

/**
 * Check if a statement type can have children
 * Options cannot have children in our app
 */
export function canHaveChildren(statementType: StatementType | undefined): boolean {
	return statementType !== StatementType.option;
}

/**
 * Update node styles in MindElixir data when selection changes
 */
export function updateNodeSelectionStyles(
	nodeData: FreediNodeObj,
	selectedStatementIds: string[],
): void {
	const isSelected = selectedStatementIds.includes(nodeData.id);
	const style = getStyleForType(nodeData.statementType, isSelected);
	nodeData.style = style;
	nodeData.isSelected = isSelected;

	if (nodeData.children) {
		nodeData.children.forEach((child) => {
			updateNodeSelectionStyles(child as FreediNodeObj, selectedStatementIds);
		});
	}
}
