/**
 * Mind Map Statement Operations
 * Special functions for creating and editing statements directly from the mind map
 */

import { Statement, StatementType } from '@freedi/shared-types';
import { saveStatementToDB, updateStatementText } from '@/controllers/db/statements/setStatements';
import { logError } from '@/utils/errorHandling';
import { canHaveChildren } from './mindElixirTransform';

/**
 * Default text for new nodes based on statement type
 */
const DEFAULT_TEXT: Partial<Record<StatementType, string>> = {
	[StatementType.question]: 'New Question',
	[StatementType.option]: 'New Option',
	[StatementType.group]: 'New Group',
	[StatementType.statement]: 'New Statement',
	[StatementType.document]: 'New Document',
	[StatementType.comment]: 'New Comment',
};

/**
 * Get default text for a statement type
 */
function getDefaultText(type: StatementType): string {
	return DEFAULT_TEXT[type] || 'New Item';
}

/**
 * Determines the default child type based on the parent's statement type
 * - Group → Question (groups contain questions)
 * - Question → Option (questions contain options)
 * - Option → cannot have children
 */
export function getDefaultChildType(parentType: StatementType | undefined): StatementType | null {
	switch (parentType) {
		case StatementType.group:
			return StatementType.question;
		case StatementType.question:
			return StatementType.option;
		case StatementType.option:
			// Options cannot have children
			return null;
		case StatementType.statement:
			return StatementType.question;
		default:
			// Default to question for root/unknown
			return StatementType.question;
	}
}

/**
 * Determines the default sibling type (same as current node type)
 */
export function getDefaultSiblingType(currentType: StatementType | undefined): StatementType {
	return currentType || StatementType.question;
}

interface CreateMindMapChildParams {
	parentStatement: Statement;
	defaultText?: string;
}

/**
 * Creates a child statement from the mind map
 * Used when user presses Tab on a node
 */
export async function createMindMapChild({
	parentStatement,
	defaultText,
}: CreateMindMapChildParams): Promise<Statement | undefined> {
	try {
		// Check if parent can have children
		if (!canHaveChildren(parentStatement.statementType)) {
			console.info('Options cannot have children');
			return undefined;
		}

		// Determine child type based on parent
		const childType = getDefaultChildType(parentStatement.statementType);
		if (!childType) {
			console.info('Cannot determine child type for parent:', parentStatement.statementType);
			return undefined;
		}

		const text = defaultText || getDefaultText(childType);

		const statement = await saveStatementToDB({
			text,
			parentStatement,
			statementType: childType,
		});

		return statement;
	} catch (error) {
		logError(error, {
			operation: 'mindMapStatements.createMindMapChild',
			statementId: parentStatement.statementId,
			metadata: { parentType: parentStatement.statementType },
		});
		return undefined;
	}
}

interface CreateMindMapSiblingParams {
	currentStatement: Statement;
	parentStatement: Statement;
	defaultText?: string;
}

/**
 * Creates a sibling statement from the mind map
 * Used when user presses Enter on a node
 */
export async function createMindMapSibling({
	currentStatement,
	parentStatement,
	defaultText,
}: CreateMindMapSiblingParams): Promise<Statement | undefined> {
	try {
		// Sibling has same type as current node
		const siblingType = getDefaultSiblingType(currentStatement.statementType);
		const text = defaultText || getDefaultText(siblingType);

		const statement = await saveStatementToDB({
			text,
			parentStatement,
			statementType: siblingType,
		});

		return statement;
	} catch (error) {
		logError(error, {
			operation: 'mindMapStatements.createMindMapSibling',
			statementId: currentStatement.statementId,
			metadata: {
				currentType: currentStatement.statementType,
				parentId: parentStatement.statementId,
			},
		});
		return undefined;
	}
}

interface UpdateMindMapNodeTextParams {
	statement: Statement;
	newText: string;
}

/**
 * Updates the text of a statement from the mind map
 * Used when user edits a node inline
 */
export async function updateMindMapNodeText({
	statement,
	newText,
}: UpdateMindMapNodeTextParams): Promise<void> {
	try {
		if (!newText || newText.trim().length < 2) {
			console.info('Text too short, not updating');
			return;
		}

		await updateStatementText(statement, newText);
	} catch (error) {
		logError(error, {
			operation: 'mindMapStatements.updateMindMapNodeText',
			statementId: statement.statementId,
		});
	}
}
