import type { Firestore } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/firestore';
import type { QueryDocumentSnapshot } from 'firebase-functions/v1/firestore';
import type { Change } from 'firebase-functions/v1';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	isCounterMilestone,
	StatementSubscription,
	StatementType,
} from '@freedi/shared-types';
import { db } from './db';
import { logError } from './utils/errorHandling';
import { validateRoleChange } from './fn_subscriptions';
import { feedRelevantChange, reconcileUserFeedEntry } from './userFeed/userFeedMembership';
import { stripCreatedSubscriptionTokens } from './notifications/stripSubscriptionTokens';
import { recordMemberCount } from './progress/questionProgressWriter';

/**
 * Membership lifecycle triggers on `statementsSubscribe/{subscriptionId}`.
 *
 * The old `updateStatementMemberCount` was onDocumentWritten, so it was
 * invoked (and returned early) for every subscription UPDATE — including every
 * activity stamp. Member count only changes on create/delete, so it now lives
 * on onDocumentCreated + onDocumentDeleted, together with the userFeed entry
 * lifecycle. No new invocations per update were added: feed upkeep on role
 * changes rides the existing onDocumentUpdated trigger (validateRoleChange).
 */

type SubscriptionData = Partial<StatementSubscription>;

/** Statements whose member count lives on `questionProgress`. */
const PROGRESS_COUNTED_TYPES: Array<StatementType | undefined> = [
	StatementType.question,
	StatementType.group,
];

type SnapshotEvent = FirestoreEvent<QueryDocumentSnapshot | undefined, { subscriptionId: string }>;
type ChangeEvent = FirestoreEvent<
	Change<QueryDocumentSnapshot> | undefined,
	{ subscriptionId: string }
>;

/**
 * Recounts members with a count() aggregation (1 read per 1000 index entries)
 * instead of downloading every subscription doc. Same filter as before:
 * every role counts, Sign-document subscriptions do not.
 *
 * Questions and groups keep the exact number on `questionProgress`, and copy it
 * to the statement document at milestones only: that document reaches everyone
 * present, so a write per arrival costs people x people reads.
 */
export async function updateMemberCount(
	firestore: Firestore,
	statementId: string,
	subscription: SubscriptionData = {},
): Promise<number> {
	const countSnapshot = await firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', statementId)
		.where('statementType', '!=', 'document')
		.count()
		.get();
	const memberCount = countSnapshot.data().count;
	const usesProgressDoc = PROGRESS_COUNTED_TYPES.includes(subscription.statementType);

	if (usesProgressDoc) {
		await recordMemberCount({
			statementId,
			members: memberCount,
			topParentId: subscription.statement?.topParentId,
		});
	}
	if (usesProgressDoc && !isCounterMilestone(memberCount)) return memberCount;

	await firestore.collection(Collections.statements).doc(statementId).update({
		numberOfMembers: memberCount,
		lastUpdate: Date.now(),
	});
	logger.info(`Updated numberOfMembers for statement ${statementId}: ${memberCount}`);

	return memberCount;
}

async function onMembershipChanged(
	firestore: Firestore,
	subscriptionId: string,
	subscription: SubscriptionData,
	operation: string,
): Promise<void> {
	const { statementId, userId } = subscription;
	if (!statementId) return;

	const results = await Promise.allSettled([
		updateMemberCount(firestore, statementId, subscription),
		reconcileUserFeedEntry(firestore, { subscriptionId, userId, statementId }),
	]);
	results.forEach((result) => {
		if (result.status === 'rejected') {
			logError(result.reason, { operation, userId, statementId, metadata: { subscriptionId } });
		}
	});
}

export async function onSubscriptionCreated(event: SnapshotEvent): Promise<void> {
	const subscription = event.data?.data() as SubscriptionData | undefined;
	if (!subscription) return;

	await stripCreatedSubscriptionTokens(db, event.params.subscriptionId, subscription);
	await onMembershipChanged(
		db,
		event.params.subscriptionId,
		subscription,
		'subscriptionLifecycle.onSubscriptionCreated',
	);
}

export async function onSubscriptionDeleted(event: SnapshotEvent): Promise<void> {
	const subscription = event.data?.data() as SubscriptionData | undefined;
	if (!subscription) return;

	await onMembershipChanged(
		db,
		event.params.subscriptionId,
		subscription,
		'subscriptionLifecycle.onSubscriptionDeleted',
	);
}

/**
 * The existing onDocumentUpdated trigger (deployed as `validateRoleChange`):
 * first the ban guard, then — only when role/identity changed — the feed entry.
 */
export async function onSubscriptionUpdated(event: ChangeEvent): Promise<void> {
	await validateRoleChange(event);

	const before = event.data?.before.data() as SubscriptionData | undefined;
	const after = event.data?.after.data() as SubscriptionData | undefined;
	if (!before || !after || !feedRelevantChange(before, after)) return;

	try {
		await reconcileUserFeedEntry(db, {
			subscriptionId: event.params.subscriptionId,
			userId: after.userId,
			statementId: after.statementId,
		});
	} catch (error) {
		logError(error, {
			operation: 'subscriptionLifecycle.onSubscriptionUpdated',
			userId: after.userId,
			statementId: after.statementId,
		});
	}
}
