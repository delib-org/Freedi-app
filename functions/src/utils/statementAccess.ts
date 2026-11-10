import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Access, Collections, Role, type Statement } from '@freedi/shared-types';
import { findStatementAdminSource } from '../progress/assertStatementAdmin';

const OPEN_ACCESS: ReadonlySet<string> = new Set([
	Access.public,
	Access.open,
	Access.openToAll,
	Access.openForRegistered,
]);

const ACTIVE_ROLES: ReadonlySet<string> = new Set([Role.admin, Role.creator, Role.member]);
const HOST_ROLES: ReadonlySet<string> = new Set([Role.admin, Role.creator]);

/** A deeper tree than this is read only as far as its nearest levels and its top. */
const MAX_ANCESTORS = 12;
const TOP = 'top';

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
	const subscriptionIds = [...new Set([statementId, topParentId])];
	const subscriptions = await firestore.getAll(
		...subscriptionIds.map((id) =>
			firestore.collection(Collections.statementsSubscribe).doc(`${uid}--${id}`),
		),
	);
	const roles = subscriptions
		.filter((snap) => snap.exists)
		.map((snap) => (snap.data() as { role?: string } | undefined)?.role);

	if (roles.includes(Role.banned)) {
		throw new HttpsError('permission-denied', 'You cannot take part in this space');
	}
	if (roles.some((role) => role !== undefined && ACTIVE_ROLES.has(role))) {
		return { statement, topParentId };
	}

	const top =
		topParentId === statementId
			? statement
			: ((await statements.doc(topParentId).get()).data() as Statement | undefined);
	const access = statement.membership?.access ?? top?.membership?.access;
	if (access && OPEN_ACCESS.has(access)) return { statement, topParentId };

	throw new HttpsError('permission-denied', 'You are not a member of this space');
}

interface AccessLevel {
	statement: Statement | undefined;
	role: string | undefined;
}

/** Nearest ancestor first, the top statement always included. */
function ancestorIds(question: Statement): string[] {
	const listed = [...(question.parents ?? []), question.parentId].filter(
		(id) => !!id && id !== TOP && id !== question.statementId,
	);
	const nearestFirst = [...new Set(listed)].reverse().slice(0, MAX_ANCESTORS);
	const top = question.topParentId;
	if (top && top !== TOP && top !== question.statementId && !nearestFirst.includes(top)) {
		nearestFirst.push(top);
	}

	return nearestFirst;
}

/** The question first, then each ancestor up to the top. */
async function readAccessLevels(
	firestore: Firestore,
	uid: string,
	question: Statement,
): Promise<AccessLevel[]> {
	const ids = [question.statementId, ...ancestorIds(question)];
	const statements = firestore.collection(Collections.statements);
	const subscriptions = firestore.collection(Collections.statementsSubscribe);
	const [statementSnaps, subscriptionSnaps] = await Promise.all([
		firestore.getAll(...ids.map((id) => statements.doc(id))),
		firestore.getAll(...ids.map((id) => subscriptions.doc(`${uid}--${id}`))),
	]);

	return ids.map((_, index) => ({
		statement: statementSnaps[index].data() as Statement | undefined,
		role: (subscriptionSnaps[index].data() as { role?: string } | undefined)?.role,
	}));
}

/**
 * Whether the caller may take part in a question, reading the whole way up the
 * tree. The rules follow the app (`useAuthorization`):
 *
 * - a ban at any level refuses; a host at any level gets in;
 * - a hidden question, or one under something hidden, is `not-found` to anyone
 *   but an admin, so its existence is not revealed either;
 * - a statement's own access setting wins, else the nearest ancestor's, so a
 *   private group between a question and an open top is honoured;
 * - someone waiting for approval is refused unless access is `public`, the one
 *   setting the app lets through before it looks at the waiting role.
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
	if (levels.some(({ role }) => role === Role.banned)) {
		throw new HttpsError('permission-denied', 'You cannot take part in this space');
	}
	if (levels.some(({ statement }) => statement?.hide === true)) {
		const isHostInTree = levels.some(({ role }) => role !== undefined && HOST_ROLES.has(role));
		if (!isHostInTree && (await findStatementAdminSource(uid, question)) === null) {
			throw new HttpsError('not-found', 'Statement not found');
		}

		return question;
	}
	if (levels.some(({ role }) => role !== undefined && HOST_ROLES.has(role))) return question;

	const ownerIndex = levels.findIndex(({ statement }) => statement?.membership?.access);
	const access = ownerIndex >= 0 ? levels[ownerIndex].statement?.membership?.access : undefined;
	const governing = ownerIndex >= 0 ? levels.slice(0, ownerIndex + 1) : levels;
	if (governing.some(({ role }) => role !== undefined && ACTIVE_ROLES.has(role))) return question;
	if (access === Access.public) return question;
	if (governing.some(({ role }) => role === Role.waiting)) {
		throw new HttpsError('permission-denied', 'Waiting for approval');
	}
	if (access && OPEN_ACCESS.has(access)) return question;

	throw new HttpsError('permission-denied', 'You are not a member of this space');
}
