import { logger } from 'firebase-functions/v1';
import type { StatementSubscription } from '@freedi/shared-types';

/**
 * The identity of a `statementsSubscribe` doc. Every admin check (the rules'
 * isAdmin / checkTopParentAdmin, the server's isWorkspaceAdmin) finds a
 * subscription by its DOC ID `{uid}--{statementId}`; anything that instead
 * reads its FIELDS (a query on statementId / role) must only trust a doc whose
 * id agrees with them, and take the uid from `userId` (the field the id is built
 * from), never from `user.uid`. A doc that disagrees was forged (or is legacy
 * garbage) and grants nothing.
 */

/** Elevated roles: what makes a subscription an admin one. */
export const ELEVATED_ROLES: ReadonlySet<string> = new Set([
	'admin',
	'statement-creator',
	'creator',
]);

export type SubscriptionFields = Pick<Partial<StatementSubscription>, 'userId' | 'statementId'> & {
	user?: { uid?: string } | null;
	role?: string;
};

/** The doc id a subscription of `uid` on `statementId` must have. */
export function expectedSubscriptionId(uid: string, statementId: string): string {
	return `${uid}--${statementId}`;
}

/**
 * The subscriber's uid when the doc is genuine for `statementId`: its id is
 * `${userId}--${statementId}` and its statementId field matches. Otherwise undefined.
 */
export function genuineSubscriberUid(
	docId: string,
	data: SubscriptionFields | undefined,
	statementId: string,
): string | undefined {
	const uid = data?.userId;
	if (typeof uid !== 'string' || !uid) return undefined;
	if (data?.statementId !== statementId) return undefined;

	return docId === expectedSubscriptionId(uid, statementId) ? uid : undefined;
}

export type IdentityProblem = 'id-mismatch' | 'user-mismatch';

/**
 * What is wrong with a subscription's identity, for the read-only scan: the id
 * does not match `${userId}--${statementId}`, or `user.uid` differs from userId.
 */
export function identityProblems(docId: string, data: SubscriptionFields): IdentityProblem[] {
	const problems: IdentityProblem[] = [];
	const uid = typeof data.userId === 'string' ? data.userId : '';
	const statementId = typeof data.statementId === 'string' ? data.statementId : '';
	if (!uid || !statementId || docId !== expectedSubscriptionId(uid, statementId)) {
		problems.push('id-mismatch');
	}
	const userUid = data.user?.uid;
	if (typeof userUid === 'string' && userUid !== uid) problems.push('user-mismatch');

	return problems;
}

/**
 * Admin uids of `statementId` from a query on statementId == X && role == admin,
 * trusting only docs whose id is `${userId}--${statementId}` (the id every admin
 * check uses), and taking the uid from `userId`, never from `user.uid`.
 */
export function trustedAdminUids(
	docs: ReadonlyArray<{ id: string; data: () => unknown }>,
	statementId: string,
): string[] {
	const uids: string[] = [];
	for (const doc of docs) {
		const data = doc.data() as SubscriptionFields | undefined;
		const uid = genuineSubscriberUid(doc.id, data, statementId);
		if (uid && data?.role === 'admin') uids.push(uid);
		else if (!uid) {
			logger.warn('setupAdminsForStatement: skipped a subscription whose id disagrees with it', {
				subscriptionId: doc.id,
				statementId,
			});
		}
	}

	return uids;
}
