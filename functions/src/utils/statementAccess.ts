import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	Access,
	Collections,
	OPEN_ACCESS_SCOPE,
	isQuarantinedScope,
	ownAccessSetting,
	Role,
	type Statement,
} from '@freedi/shared-types';
import { findStatementAdminSource } from '../progress/assertStatementAdmin';
import { AccessScopeLevels } from '../accessScope/accessScopeLevels';

const OPEN_ACCESS: ReadonlySet<string> = new Set([
	Access.public,
	Access.open,
	Access.openToAll,
	Access.openForRegistered,
]);

const ACTIVE_ROLES: ReadonlySet<string> = new Set([Role.admin, Role.creator, Role.member]);
const HOST_ROLES: ReadonlySet<string> = new Set([Role.admin, Role.creator]);

export interface StatementAccess {
	statement: Statement;
	topParentId: string;
}

/**
 * The membership gate of the participation callables. The caller gets in with
 * an active role on the statement or its top statement, or when the statement
 * is open. Banned is always refused.
 */
export async function resolveStatementAccess(
	firestore: Firestore,
	uid: string,
	statementId: string,
): Promise<StatementAccess> {
	const statements = firestore.collection(Collections.statements);
	const statementSnap = await statements.doc(statementId).get();
	const statement = statementSnap.data() as Statement | undefined;
	if (!statementSnap.exists || !statement) {
		throw new HttpsError('not-found', 'Statement not found');
	}

	const topParentId =
		statement.parentId === 'top' || !statement.topParentId ? statementId : statement.topParentId;
	const levels = await readAccessLevels(firestore, uid, statement);
	const verdict = judgeAccessLevels(levels, 'open');
	if (verdict === 'banned') {
		throw new HttpsError('permission-denied', 'You cannot take part in this space');
	}
	// Search and the answer batch never hid hidden statements here, and in an open
	// space a pending request did not shut anyone out.
	if (verdict === 'allowed' || verdict === 'hidden') return { statement, topParentId };
	if (verdict === 'waiting' && !isRestrictedOwner(levels)) return { statement, topParentId };

	throw new HttpsError('permission-denied', 'You are not a member of this space');
}

export interface AccessLevel {
	statement:
		| (Pick<Statement, 'membership'> &
				Partial<Pick<Statement, 'hide' | 'statementType' | 'agreementBallot'>>)
		| undefined;
	role: string | undefined;
}

export type AccessVerdict = 'allowed' | 'banned' | 'hidden' | 'waiting' | 'outsider';

/** Whether no level having an access setting counts as open or as closed. */
export type NoAccessSetting = 'open' | 'closed';

export function isOpenAccess(access: string): boolean {
	return OPEN_ACCESS.has(access);
}

function isActiveRole(role: string | undefined): boolean {
	return role !== undefined && ACTIVE_ROLES.has(role);
}

function isHostRole(role: string | undefined): boolean {
	return role !== undefined && HOST_ROLES.has(role);
}

/**
 * The statement first, then each level above it, nearest first. Walks `parentId`:
 * `parents` is often only the top and the direct parent, and would skip a
 * private level between them. The stamped governing level is always included.
 */
async function readAccessLevels(
	firestore: Firestore,
	uid: string,
	statement: Statement,
): Promise<AccessLevel[]> {
	const chain = new AccessScopeLevels(firestore);
	await chain.load([statement]);
	// A statement on a loop has no real place; nothing about it can be judged.
	if (isQuarantinedScope(statement.accessScope) || chain.isLoop(statement)) {
		throw new HttpsError('not-found', 'Statement not found');
	}
	const above = chain.idsAbove(statement);
	const scope = statement.accessScope;
	if (
		scope &&
		scope !== OPEN_ACCESS_SCOPE &&
		scope !== statement.statementId &&
		!above.includes(scope)
	) {
		await chain.loadLevel(scope);
		above.push(scope);
	}

	const ids = [statement.statementId, ...above];
	const subscriptions = firestore.collection(Collections.statementsSubscribe);
	const subscriptionSnaps = await firestore.getAll(
		...ids.map((id) => subscriptions.doc(`${uid}--${id}`)),
	);

	return ids.map((id, index) => ({
		statement: index === 0 ? statement : (chain.levelOf(id) as AccessLevel['statement']),
		role: (subscriptionSnaps[index].data() as { role?: string } | undefined)?.role,
	}));
}

/**
 * The access that applies and the level whose roles count. Only the level that
 * owns the setting: a role below it can be self-granted, and a role above it is
 * not membership of a private level inside.
 */
function governingOf(levels: AccessLevel[]): {
	access?: string;
	governing: AccessLevel[];
	ownerIndex: number;
} {
	const settingAt = (index: number): string | undefined => {
		const statement = levels[index]?.statement;

		return statement ? ownAccessSetting(statement, levels[index + 1]?.statement) : undefined;
	};
	const ownerIndex = levels.findIndex((_, index) => settingAt(index));

	return ownerIndex >= 0
		? { access: settingAt(ownerIndex), governing: [levels[ownerIndex]], ownerIndex }
		: { governing: levels, ownerIndex };
}

/** Whether the setting that governs these levels is a private one. */
export function isRestrictedOwner(levels: AccessLevel[]): boolean {
	const { access } = governingOf(levels);

	return Boolean(access) && !isOpenAccess(access as string);
}

/**
 * The verdict on one statement, given the statement and each ancestor up to the
 * top, nearest first. The rules follow the app (`useAuthorization`):
 *
 * - a ban at any level refuses; inside a private level, so does waiting at any
 *   level, and a host role counts only at that level or above it (elsewhere a
 *   host at any level gets in);
 * - a hidden statement, or one under something hidden, is `hidden` to anyone
 *   but a host;
 * - a statement's own access setting wins, else the nearest ancestor's, so a
 *   private group between a question and an open top is honoured, and only a
 *   role at the level owning that setting counts;
 * - someone waiting for approval is refused unless access is `public`, the one
 *   setting the app lets through before it looks at the waiting role.
 */
export function judgeAccessLevels(
	levels: AccessLevel[],
	noSetting: NoAccessSetting,
): AccessVerdict {
	if (levels.some(({ role }) => role === Role.banned)) return 'banned';

	const { access, governing, ownerIndex } = governingOf(levels);
	const isRestricted = Boolean(access) && !isOpenAccess(access as string);
	// Inside a private level, waiting anywhere on the chain shuts the door.
	if (isRestricted && levels.some(({ role }) => role === Role.waiting)) return 'waiting';

	// Inside a private level, a host role counts only at that level or above it: a
	// host of something below holds nothing the private level gave them.
	const isHostInTree = levels.some(
		({ role }, index) => isHostRole(role) && (!isRestricted || index >= ownerIndex),
	);
	if (levels.some(({ statement }) => statement?.hide === true)) {
		return isHostInTree ? 'allowed' : 'hidden';
	}
	if (isHostInTree) return 'allowed';

	if (governing.some(({ role }) => isActiveRole(role))) return 'allowed';
	if (access === Access.public) return 'allowed';
	if (governing.some(({ role }) => role === Role.waiting)) return 'waiting';
	if (access ? isOpenAccess(access) : noSetting === 'open') return 'allowed';

	return 'outsider';
}

/**
 * Whether the caller may take part in a question, reading the whole way up the
 * tree (see `judgeAccessLevels`). A question with no access setting at any level
 * is open, the same answer as resolveAccessScope. A hidden question is `not-found` to anyone but an admin, so its
 * existence is not revealed either.
 */
export async function resolveQuestionParticipation(
	firestore: Firestore,
	uid: string,
	questionId: string,
): Promise<Statement> {
	const questionSnap = await firestore.collection(Collections.statements).doc(questionId).get();
	const question = questionSnap.data() as Statement | undefined;
	if (!questionSnap.exists || !question) throw new HttpsError('not-found', 'Statement not found');

	const levels = await readAccessLevels(firestore, uid, question);
	const verdict = judgeAccessLevels(levels, 'open');
	if (verdict === 'banned') {
		throw new HttpsError('permission-denied', 'You cannot take part in this space');
	}
	if (verdict === 'hidden' && !(await isAdminThere(uid, question, levels))) {
		throw new HttpsError('not-found', 'Statement not found');
	}
	if (verdict === 'waiting') throw new HttpsError('permission-denied', 'Waiting for approval');
	if (verdict === 'outsider') {
		throw new HttpsError('permission-denied', 'You are not a member of this space');
	}

	return question;
}

/**
 * Whether `uid` administers `statement` in a way that counts for reading it.
 * Inside a private level only roles count: having created the statement gives
 * nothing, and a host role on the statement counts only when the statement is
 * the private level itself. A host of the top, or an organization admin, counts.
 */
export async function isAdminThere(
	uid: string,
	statement: Statement,
	levels: AccessLevel[],
): Promise<boolean> {
	const via = await findStatementAdminSource(uid, statement);
	if (via === null) return false;
	if (!isRestrictedOwner(levels)) return true;
	if (via === 'topSubscription' || via === 'organization') return true;

	return via === 'subscription' && governingOf(levels).ownerIndex === 0;
}
