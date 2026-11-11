import { Access, isOpenAccessValue, OPEN_ACCESS_SCOPE, Statement } from '@freedi/shared-types';

type AccessSource =
	| (Pick<Statement, 'parentId' | 'membership'> & Partial<Pick<Statement, 'accessScope'>>)
	| null
	| undefined;

/**
 * The access level that actually applies to a space: its own, unless it is a
 * sub-space with none (or the deprecated `open`, read as "inherit"); then the
 * governing level's (the top parent's when nothing nearer governs); then Open
 * to all. Same rule MembershipSettings shows.
 */
export function resolveEffectiveAccess(statement: AccessSource, governing: AccessSource): Access {
	const own = statement?.membership?.access;

	if (own && !isAccessInherited(statement)) return own;

	const inherited = governing?.membership?.access ?? Access.openToAll;

	// Stamped open means a nearer level opened it, whatever the top says.
	return statement?.accessScope === OPEN_ACCESS_SCOPE && !isOpenAccessValue(inherited)
		? Access.openToAll
		: inherited;
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
