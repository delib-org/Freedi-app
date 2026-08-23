import { Results, Statement, StatementType } from '@freedi/shared-types';
import { TYPE_RESTRICTIONS } from '@/controllers/general/helpers';

/**
 * Types a mind-map node can be switched between. The map only paints these
 * three (see `getStyleForType`), so offering anything else would produce a
 * node the canvas has no visual language for.
 */
export const MIND_MAP_TYPE_CHOICES: readonly StatementType[] = [
	StatementType.question,
	StatementType.option,
	StatementType.group,
] as const;

/** Translation key for a type's display name. */
export const TYPE_LABEL_KEYS: Record<string, string> = {
	[StatementType.question]: 'Question',
	[StatementType.option]: 'Option',
	[StatementType.group]: 'Group',
	[StatementType.statement]: 'Statement',
};

export interface TypeChoice {
	type: StatementType;
	labelKey: string;
	/** The node already is this type. */
	isCurrent: boolean;
	/** False when switching to this type would break the hierarchy rules. */
	allowed: boolean;
	/** Translation key explaining why it is blocked. Set only when disallowed. */
	reasonKey?: string;
}

export interface NodeContext {
	statement: Statement;
	parent?: Statement;
	children: Statement[];
}

/**
 * Locate a node in the results tree together with the context needed to decide
 * which type changes are legal: its parent and its direct children.
 */
export function findNodeContext(results: Results, id: string): NodeContext | null {
	function walk(node: Results, parent?: Statement): NodeContext | null {
		if (node.top.statementId === id) {
			return {
				statement: node.top,
				parent,
				children: node.sub.map((sub) => sub.top),
			};
		}
		for (const sub of node.sub) {
			const found = walk(sub, node.top);
			if (found) return found;
		}

		return null;
	}

	return walk(results);
}

/**
 * Mirror of the server-side rules in `changeStatementType`, evaluated locally so
 * the menu can grey out impossible targets instead of failing after the click.
 * The write path still re-validates against Firestore — this is UI affordance,
 * not the authority.
 */
export function getTypeChangeChoices({ statement, parent, children }: NodeContext): TypeChoice[] {
	const currentType = statement.statementType;
	const isGroup = currentType === StatementType.group;
	const hasOptionChildren = children.some((child) => child.statementType === StatementType.option);
	const parentRestrictions = parent ? TYPE_RESTRICTIONS[parent.statementType] : undefined;

	return MIND_MAP_TYPE_CHOICES.map((type) => {
		const isCurrent = type === currentType;
		const base = { type, labelKey: TYPE_LABEL_KEYS[type] ?? type, isCurrent };

		if (isCurrent) return { ...base, allowed: false };

		// Groups are structural containers; the server refuses to retype them.
		if (isGroup) {
			return { ...base, allowed: false, reasonKey: 'Cannot change the type of a group' };
		}

		if (parentRestrictions?.disallowedChildren?.includes(type)) {
			return {
				...base,
				allowed: false,
				reasonKey: parentRestrictions.reason ?? 'Type change not allowed',
			};
		}

		// Options are leaves and groups may not hold options, so neither target
		// works while options hang off this node.
		if (hasOptionChildren && (type === StatementType.option || type === StatementType.group)) {
			return { ...base, allowed: false, reasonKey: 'This statement has options under it' };
		}

		return { ...base, allowed: true };
	});
}

/** True when at least one type change is possible — otherwise hide the control. */
export function hasAnyTypeChange(choices: TypeChoice[]): boolean {
	return choices.some((choice) => choice.allowed);
}
