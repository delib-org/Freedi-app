import type { Statement } from '@freedi/shared-types';
import { canHaveChildren } from './mindElixirTransform';
import {
	createMindMapChild,
	createMindMapSibling,
	getDefaultChildType,
	getDefaultSiblingType,
} from './mindMapStatements';
import { getChildAddLabelKey, getNewNodeText, getSiblingAddLabelKey } from './nodeMenuLabels';

/** One "add a node under / beside the selected node" action: label plus the call that creates it. */
export interface NodeAddAction {
	label: string;
	/** Creates the node; resolves to the new statement, or undefined when nothing was created. */
	run: () => ReturnType<typeof createMindMapChild>;
}

export interface NodeAddActions {
	child?: NodeAddAction;
	sibling?: NodeAddAction;
}

/**
 * The add actions a selected node offers. The "+" pills on the node and the
 * phone bottom sheet both read this, so labels, conditions and behavior match:
 * a child needs a type that can have children; a sibling needs a parent in the tree.
 */
export function resolveNodeAddActions(
	statement: Statement,
	parentOfNode: Statement | null | undefined,
	t: (key: string) => string,
): NodeAddActions {
	const actions: NodeAddActions = {};

	if (canHaveChildren(statement.statementType)) {
		actions.child = {
			label: t(getChildAddLabelKey(statement.statementType)),
			run: () =>
				createMindMapChild({
					parentStatement: statement,
					defaultText: getNewNodeText(getDefaultChildType(statement.statementType), t),
				}),
		};
	}

	if (parentOfNode) {
		actions.sibling = {
			label: t(getSiblingAddLabelKey(statement.statementType)),
			run: () =>
				createMindMapSibling({
					currentStatement: statement,
					parentStatement: parentOfNode,
					defaultText: getNewNodeText(getDefaultSiblingType(statement.statementType), t),
				}),
		};
	}

	return actions;
}
