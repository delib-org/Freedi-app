import { StatementType } from '@freedi/shared-types';
import { getDefaultChildType, getDefaultSiblingType } from './mindMapStatements';

/**
 * Pure label and permission rules for the mind-map node panel and its "+"
 * buttons. Every label names what gets created or done, so the panel never
 * shows an unnamed icon.
 */

/** Translation key for a "+" button, named after the type it creates. */
export function getAddLabelKey(createdType: StatementType | null | undefined): string {
	switch (createdType) {
		case StatementType.question:
			return 'Add Question';
		case StatementType.option:
			return 'question.sheet.add';
		case StatementType.group:
			return 'question.sheet.createSpace';
		default:
			return 'Add';
	}
}

/** Label key of the "+" that adds a child under a node of this type. */
export function getChildAddLabelKey(nodeType: StatementType | undefined): string {
	return getAddLabelKey(getDefaultChildType(nodeType));
}

/** Label key of the "+" that adds a sibling beside a node of this type. */
export function getSiblingAddLabelKey(nodeType: StatementType | undefined): string {
	return getAddLabelKey(getDefaultSiblingType(nodeType));
}

/** Translation key for the starting text of a new node, or undefined to keep the built-in default. */
export function getNewNodeTextKey(
	createdType: StatementType | null | undefined,
): string | undefined {
	switch (createdType) {
		case StatementType.question:
			return 'map.node.newQuestion';
		case StatementType.option:
			return 'map.node.newAnswer';
		case StatementType.group:
			return 'New space';
		default:
			return undefined;
	}
}

/** Starting text of a new node in the viewer's language; undefined keeps the built-in default. */
export function getNewNodeText(
	createdType: StatementType | null | undefined,
	t: (key: string) => string,
): string | undefined {
	const key = getNewNodeTextKey(createdType);

	return key ? t(key) : undefined;
}

interface NodePermissionInput {
	isAdmin: boolean;
	isAuthor: boolean;
}

/** Edit is for an admin or the person who wrote the node. */
export function canEditNode({ isAdmin, isAuthor }: NodePermissionInput): boolean {
	return isAdmin || isAuthor;
}

interface DeletePermissionInput extends NodePermissionInput {
	isRoot: boolean;
	statementType: StatementType | undefined;
}

/** Delete: admin or author, never the root and never a space (group). */
export function canDeleteNode({
	isAdmin,
	isAuthor,
	isRoot,
	statementType,
}: DeletePermissionInput): boolean {
	if (isRoot || statementType === StatementType.group) return false;

	return isAdmin || isAuthor;
}
