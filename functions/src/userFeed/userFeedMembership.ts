import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	Role,
	StatementSubscription,
	UserFeedItem,
	getUserFeedId,
	isTopLevelSubscription,
	isUserFeedRole,
} from '@freedi/shared-types';

/** gRPC status code Firestore uses when `create` hits an existing doc. */
const ALREADY_EXISTS_CODE = 6;

export type UserFeedReconcileResult = 'created' | 'kept' | 'deleted' | 'skipped';

/** The fields of a subscription the feed cares about (legacy docs may lack some). */
type SubscriptionFeedFields = Pick<
	Partial<StatementSubscription>,
	'userId' | 'statementId' | 'role' | 'parentId' | 'lastUpdate' | 'createdAt'
> & { statement?: { parentId?: string } };

interface ReconcileParams {
	subscriptionId: string;
	/** userId/statementId from the trigger event — needed to delete when the subscription is gone. */
	userId: string | undefined;
	statementId: string | undefined;
	now?: number;
}

/** True when this subscription should have a home-feed entry. */
export function shouldHaveFeedEntry(subscription: SubscriptionFeedFields | undefined): boolean {
	if (!subscription?.userId || !subscription.statementId) return false;

	return isTopLevelSubscription(subscription) && isUserFeedRole(subscription.role as Role);
}

/**
 * Makes the user's feed entry match the subscription's CURRENT state.
 *
 * Reads the subscription doc instead of trusting the event payload, so the
 * result does not depend on trigger order: a fast leave-then-rejoin, or a ban
 * that validateRoleChange reverts, converge to the right answer whichever
 * trigger runs last. Creating never overwrites an existing entry's
 * lastActivity (a role flip must not bump the discussion).
 */
export async function reconcileUserFeedEntry(
	db: Firestore,
	params: ReconcileParams,
): Promise<UserFeedReconcileResult> {
	const { subscriptionId, userId, statementId } = params;
	if (!userId || !statementId) return 'skipped';

	const now = params.now ?? Date.now();
	const feedId = getUserFeedId(userId, statementId);
	const feedRef = db.collection(Collections.userFeed).doc(feedId);

	const subscriptionSnap = await db
		.collection(Collections.statementsSubscribe)
		.doc(subscriptionId)
		.get();
	const current = subscriptionSnap.exists
		? (subscriptionSnap.data() as SubscriptionFeedFields)
		: undefined;

	if (!shouldHaveFeedEntry(current)) {
		await feedRef.delete();

		return 'deleted';
	}

	const entry: UserFeedItem = {
		feedId,
		userId,
		statementId,
		subscriptionId,
		lastActivity: current?.lastUpdate || current?.createdAt || now,
		createdAt: now,
	};

	try {
		await feedRef.create(entry);
		logger.info(`userFeed entry created: ${feedId}`);

		return 'created';
	} catch (error) {
		if ((error as { code?: number }).code === ALREADY_EXISTS_CODE) return 'kept';
		throw error;
	}
}

/** True when a subscription update changed something the feed depends on. */
export function feedRelevantChange(
	before: SubscriptionFeedFields,
	after: SubscriptionFeedFields,
): boolean {
	return (
		before.role !== after.role || isTopLevelSubscription(before) !== isTopLevelSubscription(after)
	);
}
