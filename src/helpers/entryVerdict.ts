import {
	Access,
	Creator,
	isOpenAccessValue,
	OPEN_ACCESS_SCOPE,
	Role,
	Statement,
	StatementSubscription,
} from '@freedi/shared-types';

/** Whether one person may enter one level of the statement tree. */
export type EntryVerdict = 'open' | 'waiting' | 'closed' | 'gone';

type Level = Pick<Statement, 'statementId' | 'topParentId' | 'membership' | 'creator'> &
	Partial<Pick<Statement, 'accessScope'>>;
type Person = Pick<Creator, 'uid' | 'isAnonymous'>;

const TOP_LEVEL_MARKER = 'top';

export function isAdminRole(role?: Role): boolean {
	return role === Role.admin || role === Role.creator;
}

function isRestrictedScope(scope: string | undefined): scope is string {
	return Boolean(scope) && scope !== OPEN_ACCESS_SCOPE;
}

/**
 * The level that decides who may enter this one, and so whose subscription
 * counts. `accessScope` names it, as the database rules read it. An open or
 * unstamped level falls back on its own setting, then the top parent's.
 */
export function getSubscriptionScopeId(level: Level | undefined): string | undefined {
	if (!level) return undefined;
	if (isRestrictedScope(level.accessScope)) return level.accessScope;

	return level.membership?.access ? level.statementId : level.topParentId;
}

/** The level a statement inherits from: a nearer private level, else the top. */
export function getInheritedLevelId(
	level: Pick<Level, 'statementId' | 'topParentId' | 'accessScope'> | undefined,
): string | undefined {
	const scope = level?.accessScope;

	return isRestrictedScope(scope) && scope !== level?.statementId ? scope : level?.topParentId;
}

/** The access that governs a level, given the level `getSubscriptionScopeId` names. */
export function getLevelAccess(
	level: Pick<Level, 'statementId' | 'membership' | 'accessScope'> | undefined,
	governing: Pick<Level, 'membership'> | undefined,
): Access | undefined {
	const scope = level?.accessScope;
	if (isRestrictedScope(scope)) {
		return scope === level?.statementId ? level.membership?.access : governing?.membership?.access;
	}

	const access = level?.membership?.access || governing?.membership?.access;
	if (scope !== OPEN_ACCESS_SCOPE) return access;

	// Stamped open: an access the verdict would not read as open must not close it.
	return access && access !== Access.open && isOpenAccessValue(access) ? access : Access.openToAll;
}

function hasMemberRole(role: Role | undefined): boolean {
	return role === Role.member || isAdminRole(role);
}

export function isMemberOfLevel(
	level: Level | undefined,
	role: Role | undefined,
	person: Person | undefined,
): boolean {
	const levelCreatorUid = level?.creator?.uid;

	return (
		role === Role.member ||
		isAdminRole(role) ||
		(!!levelCreatorUid && !!person?.uid && levelCreatorUid === person.uid)
	);
}

/**
 * The one decision on who may enter a level. The gate (useAuthorization) and
 * the way up (findUpTarget) both ask here, so they cannot disagree. Reads
 * nothing and writes nothing.
 */
export function getEntryVerdict(
	level: Level | undefined,
	governing: Pick<Level, 'membership'> | undefined,
	subscription: Pick<StatementSubscription, 'role'> | undefined,
	person: Person | undefined,
): EntryVerdict {
	if (!level) return 'gone';

	const access = getLevelAccess(level, governing);
	const role = subscription?.role;

	if (access === Access.public) return 'open';
	// Inside a private level only roles count, as the database reads it: having
	// created the level is no way in without one.
	const isRestricted = access === Access.moderated || access === Access.secret;
	if (isRestricted ? hasMemberRole(role) : isMemberOfLevel(level, role, person)) return 'open';
	if (role === Role.waiting) return 'waiting';
	if (role === Role.banned) return 'closed';
	if (access === Access.openToAll) return 'open';
	if (access === Access.openForRegistered && person?.isAnonymous === false) return 'open';

	return 'closed';
}

/**
 * Whether possibly incomplete local data is enough to call a level open. On an
 * open group, a missing subscription is not proof of "not banned": it may just
 * not be loaded. So only public access, membership, the level's creator or a
 * loaded subscription can prove it; anything else needs a read.
 */
export function isProvenOpen(
	level: Level | undefined,
	governing: Pick<Level, 'membership'> | undefined,
	subscription: Pick<StatementSubscription, 'role'> | undefined,
	person: Person | undefined,
): boolean {
	if (getEntryVerdict(level, governing, subscription, person) !== 'open') return false;

	const access = getLevelAccess(level, governing);

	return (
		access === Access.public ||
		isMemberOfLevel(level, subscription?.role, person) ||
		subscription !== undefined
	);
}

/** Every level above a statement, nearest first, without the `top` marker or the statement itself. */
export function getLevelsAbove(
	statement: Pick<Statement, 'statementId' | 'parents' | 'parentId' | 'topParentId'>,
): string[] {
	const { statementId, parents, parentId, topParentId } = statement;
	const path = parents?.length ? [...parents].reverse() : [parentId, topParentId];

	return [...new Set(path)].filter((id) => !!id && id !== TOP_LEVEL_MARKER && id !== statementId);
}
