/**
 * Home surfacing: when a user subscribes to a nested statement (e.g. a
 * question inside a group) without holding a subscription on its top
 * parent, mirror a `member` subscription onto the top parent so the group
 * appears on their Home screen.
 *
 * Skips moderated / secret tops (those require an explicit approval flow)
 * and never overwrites an existing subscription (`create()` semantics).
 */

import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import {
	Access,
	Collections,
	Role,
	Statement,
	StatementSubscription,
	StatementType,
	statementToSimpleStatement,
} from '@freedi/shared-types';
import { db } from './db';
import { logError } from './utils/errorHandling';

const TOP = 'top';
const SKIPPED_ROLES: readonly Role[] = [Role.banned, Role.unsubscribed, Role.waiting];
const CLOSED_ACCESS: readonly Access[] = [Access.moderated, Access.secret];
const SURFACED_TYPES: readonly StatementType[] = [StatementType.group, StatementType.question];

type SubscriptionCreatedEvent = FirestoreEvent<
	QueryDocumentSnapshot | undefined,
	{ subscriptionId: string }
>;

function isAlreadyExists(error: unknown): boolean {
	const err = error as { code?: number | string; message?: string } | undefined;

	return (
		err?.code === 6 || err?.code === 'already-exists' || /already exists/i.test(err?.message ?? '')
	);
}

export async function ensureTopParentSubscription(event: SubscriptionCreatedEvent): Promise<void> {
	if (!event.data) return;
	const sub = event.data.data() as Partial<StatementSubscription> | undefined;
	if (!sub?.statementId || !sub.user?.uid) return;

	const userId = sub.user.uid;
	const topParentId =
		sub.topParentId ?? (sub.statement as Partial<Statement> | undefined)?.topParentId;
	if (!topParentId || topParentId === TOP || topParentId === sub.statementId) return;
	if (sub.role && SKIPPED_ROLES.includes(sub.role)) return;

	try {
		const topSubId = `${userId}--${topParentId}`;
		const topSubRef = db.collection(Collections.statementsSubscribe).doc(topSubId);
		const existing = await topSubRef.get();
		if (existing.exists) return;

		const topSnap = await db.collection(Collections.statements).doc(topParentId).get();
		if (!topSnap.exists) return;
		const top = topSnap.data() as Statement;
		if (!SURFACED_TYPES.includes(top.statementType)) return;

		const access = top.membership?.access;
		if (access && CLOSED_ACCESS.includes(access)) return;

		const now = Date.now();
		const topSub: StatementSubscription = {
			role: Role.member,
			userId,
			statementId: topParentId,
			statementsSubscribeId: topSubId,
			statement: statementToSimpleStatement(top),
			user: sub.user,
			parentId: TOP,
			statementType: top.statementType,
			topParentId,
			lastUpdate: now,
			createdAt: now,
			getInAppNotification: true,
			getEmailNotification: false,
			getPushNotification: false,
			...(top.organizationId ? { organizationId: top.organizationId } : {}),
		};

		await topSubRef.create(topSub);
		logger.info('[ensureTopParentSubscription] mirrored member sub onto top parent', {
			userId,
			statementId: sub.statementId,
			topParentId,
		});
	} catch (error) {
		if (isAlreadyExists(error)) return;
		logError(error, {
			operation: 'subscriptions.ensureTopParentSubscription',
			userId,
			statementId: sub.statementId,
			metadata: { topParentId },
		});
	}
}
