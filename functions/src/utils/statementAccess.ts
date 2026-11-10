import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Access, Collections, Role, type Statement } from '@freedi/shared-types';

const OPEN_ACCESS: ReadonlySet<string> = new Set([
	Access.public,
	Access.open,
	Access.openToAll,
	Access.openForRegistered,
]);

const ACTIVE_ROLES: ReadonlySet<string> = new Set([Role.admin, Role.creator, Role.member]);

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
