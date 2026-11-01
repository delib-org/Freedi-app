import { Access, Statement } from '@freedi/shared-types';

type AccessSource = Pick<Statement, 'parentId' | 'membership'> | null | undefined;

/**
 * The access level that actually applies to a space: its own, unless it is a
 * sub-space with none (or the deprecated `open`, read as "inherit"); then the
 * top parent's; then Open to all. Same rule MembershipSettings shows.
 */
export function resolveEffectiveAccess(statement: AccessSource, topParent: AccessSource): Access {
	const own = statement?.membership?.access;

	if (own && !isAccessInherited(statement)) return own;

	return topParent?.membership?.access ?? Access.openToAll;
}

/**
 * True when a sub-space takes its access level from the group: it has none of
 * its own, or only the deprecated `open`. A top-level space never inherits.
 */
export function isAccessInherited(statement: AccessSource): boolean {
	if (statement?.parentId === 'top') return false;
	const own = statement?.membership?.access;

	return !own || own === Access.open;
}
