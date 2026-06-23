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
 * Sticky-note palette for the shareable cluster board. Each first-level branch
 * gets one entry; descendants inherit it so an arm and its cards share a hue —
 * the SCAMPER board look. Concrete hex (not CSS vars) because mind-elixir paints
 * `branchColor` onto SVG connector strokes via JS, which doesn't resolve vars.
 */
export interface ClusterPaletteEntry {
	/** Strong color for connector lines and the branch/cluster pill. */
	line: string;
	/** Light tint for member sticky-note cards. */
	card: string;
	/** Readable text color on the card tint. */
	text: string;
}

export const CLUSTER_PALETTE: ClusterPaletteEntry[] = [
	{ line: '#f2c12e', card: '#fdeca8', text: '#5b4a00' }, // yellow
	{ line: '#8b6fd6', card: '#d9ccf3', text: '#2e1d56' }, // purple
	{ line: '#4a9fe0', card: '#c2e0f7', text: '#0f3350' }, // blue
	{ line: '#5fbb46', card: '#cdeec0', text: '#1f3d10' }, // green
	{ line: '#ee8a37', card: '#fbd9b5', text: '#5a2f06' }, // orange
	{ line: '#e76fa6', card: '#f8cfe0', text: '#5a1336' }, // pink
	{ line: '#34bdb4', card: '#bdeeea', text: '#0c3b38' }, // teal
	{ line: '#e2554d', card: '#fae0df', text: '#5a221f' }, // red
	{ line: '#5b6cd6', card: '#e2e5f8', text: '#242b56' }, // indigo
	{ line: '#8cbf3f', card: '#eaf3dc', text: '#384c19' }, // lime
	{ line: '#2bb6c4', card: '#d9f2f4', text: '#11494e' }, // cyan
	{ line: '#c455b8', card: '#f4e0f2', text: '#4e224a' }, // magenta
	{ line: '#d99a2b', card: '#f8edd9', text: '#573e11' }, // amber
	{ line: '#6b7a99', card: '#e4e7ed', text: '#2b313d' }, // slate
	{ line: '#e06b8a', card: '#f9e4ea', text: '#5a2b37' }, // rose
	{ line: '#4ab0e0', card: '#def1f9', text: '#1e465a' }, // sky
];

/** Dark "Subject" hub style for the board root, matching the reference design. */
const BOARD_ROOT_STYLE: MindElixirNodeStyle = {
	background: '#2b2b33',
	color: '#ffffff',
	fontWeight: '700',
};

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
export interface ToMindElixirOptions {
	/** Apply the sticky-note cluster-board styling (per-branch colors, dark hub). */
	boardMode?: boolean;
}

export function toMindElixirData(
	results: Results,
	selectedStatementIds: string[] = [],
	formatClusterTag: ClusterTagFormatter = defaultClusterTagFormatter,
	options: ToMindElixirOptions = {},
): MindElixirData {
	const { boardMode = false } = options;

	// depth 0 = root/subject, depth 1 = labeled branches (assigned a palette color),
	// deeper = sticky cards inheriting their branch color.
	function transformNode(
		result: Results,
		depth: number,
		branch: (typeof CLUSTER_PALETTE)[number] | null,
	): FreediNodeObj {
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

		if (boardMode) {
			applyBoardStyle(node, depth, branch);
		}

		// Transform children recursively
		if (result.sub && result.sub.length > 0) {
			node.children = result.sub.map((subResult, index) =>
				transformNode(
					subResult,
					depth + 1,
					branch ?? CLUSTER_PALETTE[index % CLUSTER_PALETTE.length],
				),
			);
		}

		return node;
	}

	return {
		nodeData: transformNode(results, 0, null),
	};
}

/**
 * Override a node's appearance with the board look. Root = dark hub; first-level
 * branch = solid colored pill; deeper nodes = tinted sticky cards. The branch
 * color also tints the connector lines so each arm reads as one group.
 */
function applyBoardStyle(
	node: FreediNodeObj,
	depth: number,
	branch: (typeof CLUSTER_PALETTE)[number] | null,
): void {
	if (depth === 0) {
		node.style = { ...BOARD_ROOT_STYLE };

		return;
	}
	if (!branch) return;

	node.branchColor = branch.line;
	if (depth === 1) {
		// Labeled branch pill — solid color, white text.
		node.style = { background: branch.line, color: '#ffffff', fontWeight: '600' };
	} else {
		// Sticky-note card — light tint of the branch color.
		node.style = { background: branch.card, color: branch.text };
	}
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
