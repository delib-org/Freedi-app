import { Access, Statement } from '@freedi/shared-types';

type AccessSource = Pick<Statement, 'parentId' | 'membership'> | null | undefined;

/**
 * The access level that actually applies to a space: its own, unless it is a
 * sub-space with none (or the deprecated `open`, read as "inherit"); then the
 * top parent's; then Open to all. Same rule MembershipSettings shows.
 */
export function resolveEffectiveAccess(statement: AccessSource, topParent: AccessSource): Access {
	const own = statement?.membership?.access;
	const isTopLevel = statement?.parentId === 'top';
	const ownCounts = Boolean(own) && (isTopLevel || own !== Access.open);

	if (ownCounts && own) return own;

	return topParent?.membership?.access ?? Access.openToAll;
}
