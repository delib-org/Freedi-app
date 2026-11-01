import { resolveStakeholderCount, type StakeholderScope } from '@freedi/shared-types';

type Scope = (StakeholderScope & { parentId?: string }) | null | undefined;

export interface InheritedStakeholders {
	/** What "Same as the group" gives; undefined when nobody above declared one. */
	count?: number;
	/** The number comes from the group (top parent, or a parent that is the group). */
	isFromGroup: boolean;
}

/** The stakeholder count a sub-space would get if it declared none of its own. */
export function resolveInheritedStakeholders(parent: Scope, top: Scope): InheritedStakeholders {
	const { count, source } = resolveStakeholderCount(
		undefined,
		parent ?? undefined,
		top ?? undefined,
	);
	const isFromGroup = source === 'top' || (source === 'parent' && parent?.parentId === 'top');

	return { count, isFromGroup };
}

/**
 * True when a space shows the inherited count: a sub-space with no positive
 * count of its own. A top-level space never inherits.
 */
export function isStakeholderCountInherited(statement: Scope): boolean {
	if (statement?.parentId === 'top') return false;
	const { count } = resolveStakeholderCount(statement ?? undefined);

	return count === undefined;
}
