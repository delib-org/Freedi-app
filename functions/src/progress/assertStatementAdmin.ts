import { HttpsError } from 'firebase-functions/v2/https';
import {
	Collections,
	ORG_ADMIN_ROLES,
	OrganizationMember,
	Role,
	Statement,
	StatementSubscription,
	getOrganizationMemberId,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { isPlantedLevel } from '../accessScope/plantedLevels';

export type StatementAdminSource = 'creator' | 'subscription' | 'topSubscription' | 'organization';

export interface StatementAdminResult {
	via: StatementAdminSource;
	statement: Statement;
}

const ADMIN_ROLES: readonly Role[] = [Role.admin, Role.creator];
const TOP = 'top';

async function hasAdminSubscription(uid: string, statementId: string): Promise<boolean> {
	const snap = await db
		.collection(Collections.statementsSubscribe)
		.doc(`${uid}--${statementId}`)
		.get();
	if (!snap.exists) return false;
	const role = (snap.data() as Partial<StatementSubscription> | undefined)?.role;

	return !!role && ADMIN_ROLES.includes(role);
}

async function resolveOrganizationId(statement: Statement): Promise<string | undefined> {
	if (statement.organizationId) return statement.organizationId;
	const topParentId = statement.topParentId;
	if (!topParentId || topParentId === TOP || topParentId === statement.statementId)
		return undefined;
	const topSnap = await db.collection(Collections.statements).doc(topParentId).get();

	return topSnap.exists
		? (topSnap.data() as Partial<Statement> | undefined)?.organizationId
		: undefined;
}

async function isOrganizationAdmin(uid: string, organizationId: string): Promise<boolean> {
	const snap = await db
		.collection(Collections.organizationMembers)
		.doc(getOrganizationMemberId(organizationId, uid))
		.get();
	if (!snap.exists) return false;
	const role = (snap.data() as Partial<OrganizationMember> | undefined)?.role;

	return !!role && ORG_ADMIN_ROLES.includes(role);
}

/**
 * How `uid` administers `statement`, or null when they do not. Accepted paths,
 * in order:
 *   1. `statement.creatorId === uid`
 *   2. admin/creator subscription on the statement itself
 *   3. admin/creator subscription on `statement.topParentId`
 *   4. org owner/admin membership when the top statement has `organizationId`
 */
export async function findStatementAdminSource(
	uid: string,
	statement: Statement,
): Promise<StatementAdminSource | null> {
	// The creator, or a host of the statement itself, administers it, unless it was
	// planted inside a private level (see plantedLevels).
	const isOwnRole =
		statement.creatorId === uid || (await hasAdminSubscription(uid, statement.statementId));
	if (isOwnRole && !(await isPlantedLevel(db, statement))) {
		return statement.creatorId === uid ? 'creator' : 'subscription';
	}

	const topParentId = statement.topParentId;
	if (
		topParentId &&
		topParentId !== TOP &&
		topParentId !== statement.statementId &&
		(await hasAdminSubscription(uid, topParentId))
	) {
		return 'topSubscription';
	}

	const organizationId = await resolveOrganizationId(statement);
	if (organizationId && (await isOrganizationAdmin(uid, organizationId))) return 'organization';

	return null;
}

/**
 * Verifies `uid` may administer `statement` (see findStatementAdminSource).
 *
 * Throws `HttpsError('permission-denied')` otherwise. Pass a statement id
 * instead of a doc to have it loaded (`not-found` when missing).
 */
export async function assertStatementAdmin(
	uid: string,
	statementOrId: Statement | string,
	operation: string,
): Promise<StatementAdminResult> {
	let statement: Statement;
	if (typeof statementOrId === 'string') {
		const snap = await db.collection(Collections.statements).doc(statementOrId).get();
		if (!snap.exists) throw new HttpsError('not-found', 'Statement not found');
		statement = snap.data() as Statement;
	} else {
		statement = statementOrId;
	}

	const via = await findStatementAdminSource(uid, statement);
	if (via) return { via, statement };

	logError(new Error('statement admin authorization denied'), {
		operation,
		userId: uid,
		statementId: statement.statementId,
	});
	throw new HttpsError('permission-denied', 'You are not authorized for this statement');
}
