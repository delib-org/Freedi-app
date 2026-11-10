import { Access, Creator, Role, Statement, StatementSubscription } from '@freedi/shared-types';

/** Whether one person may enter one level of the statement tree. */
export type EntryVerdict = 'open' | 'waiting' | 'closed' | 'gone';

type Level = Pick<Statement, 'statementId' | 'topParentId' | 'membership' | 'creator'>;
type Person = Pick<Creator, 'uid' | 'isAnonymous'>;

const TOP_LEVEL_MARKER = 'top';

export function isAdminRole(role?: Role): boolean {
	return role === Role.admin || role === Role.creator;
}

/** A level with its own access is judged by its own subscription; any other by the top parent's. */
export function getSubscriptionScopeId(level: Level | undefined): string | undefined {
	if (!level) return undefined;

	return level.membership?.access ? level.statementId : level.topParentId;
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
	topParent: Pick<Level, 'membership'> | undefined,
	subscription: Pick<StatementSubscription, 'role'> | undefined,
	person: Person | undefined,
): EntryVerdict {
	if (!level) return 'gone';

	const access = level.membership?.access || topParent?.membership?.access;
	const role = subscription?.role;

	if (access === Access.public) return 'open';
	if (isMemberOfLevel(level, role, person)) return 'open';
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
	topParent: Pick<Level, 'membership'> | undefined,
	subscription: Pick<StatementSubscription, 'role'> | undefined,
	person: Person | undefined,
): boolean {
	if (getEntryVerdict(level, topParent, subscription, person) !== 'open') return false;

	const access = level?.membership?.access || topParent?.membership?.access;

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
