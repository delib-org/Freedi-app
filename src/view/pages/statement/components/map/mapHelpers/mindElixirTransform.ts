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
): MindElixirData {
	function transformNode(result: Results): FreediNodeObj {
		const statement = result.top;
		const isSelected =
			selectedStatementIds.includes(statement.statementId) ||
			!!(statement.isVoted || statement.isChosen);
		const style = getStyleForType(statement.statementType, isSelected);

		const node: FreediNodeObj = {
			id: statement.statementId,
			topic: statement.statement || 'Untitled',
			style,
			statementType: statement.statementType,
			statementId: statement.statementId,
			parentId: statement.parentId,
			isSelected,
		};

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
