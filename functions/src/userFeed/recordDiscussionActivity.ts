import type { Firestore, QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import { Collections, UserFeedThrottle } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import {
	SUBSCRIPTION_ACTIVITY_STAMP_ENABLED,
	USER_FEED_ACTIVITY_WINDOW_MS,
	USER_FEED_FANOUT_PAGE_SIZE,
} from './userFeedConfig';

/** gRPC status code Firestore uses when an update targets a missing doc. */
const NOT_FOUND_CODE = 5;

export interface DiscussionActivityResult {
	/** True when this call opened a new window and fanned out. */
	fannedOut: boolean;
	feedDocsUpdated: number;
	subscriptionsStamped: number;
}

interface RecordActivityOptions {
	now?: number;
	/** Defaults to the rollout switch; tests pass it explicitly. */
	stampSubscriptions?: boolean;
}

const NO_FANOUT: DiscussionActivityResult = {
	fannedOut: false,
	feedDocsUpdated: 0,
	subscriptionsStamped: 0,
};

/**
 * Records activity (a new child, a text edit) in a top-level discussion so the
 * discussion rises on its members' home pages.
 *
 * Coalesced: at most one fan-out per discussion per
 * USER_FEED_ACTIVITY_WINDOW_MS. A call inside an open window costs one read
 * (the throttle doc) and writes nothing.
 *
 * Writes go to `userFeed`, which has no triggers. The legacy
 * `statementsSubscribe.lastUpdate` stamp — which woke three membership
 * triggers per member — is written only while SUBSCRIPTION_ACTIVITY_STAMP_ENABLED
 * is on (rollout phase 1).
 *
 * Never call this for consensus / evaluation / result recalculations: those
 * reach clients live through the statement listeners, not through the feed.
 */
export async function recordDiscussionActivity(
	db: Firestore,
	topParentId: string | undefined,
	options: RecordActivityOptions = {},
): Promise<DiscussionActivityResult> {
	if (!topParentId || topParentId === 'top') return NO_FANOUT;

	const now = options.now ?? Date.now();
	const stampSubscriptions = options.stampSubscriptions ?? SUBSCRIPTION_ACTIVITY_STAMP_ENABLED;

	try {
		const claimed = await claimActivityWindow(db, topParentId, now);
		if (!claimed) return NO_FANOUT;

		const feedDocsUpdated = await stampMembers(db, Collections.userFeed, topParentId, {
			lastActivity: now,
		});
		const subscriptionsStamped = stampSubscriptions
			? await stampMembers(db, Collections.statementsSubscribe, topParentId, { lastUpdate: now })
			: 0;

		logger.info(
			`userFeed activity for ${topParentId}: ${feedDocsUpdated} feed docs, ${subscriptionsStamped} subscriptions`,
		);

		return { fannedOut: true, feedDocsUpdated, subscriptionsStamped };
	} catch (error) {
		logError(error, {
			operation: 'userFeed.recordDiscussionActivity',
			statementId: topParentId,
		});

		return NO_FANOUT;
	}
}

/**
 * Opens the discussion's activity window if the previous one has closed.
 * A transaction, so two concurrent messages cannot both fan out.
 */
async function claimActivityWindow(
	db: Firestore,
	topParentId: string,
	now: number,
): Promise<boolean> {
	const throttleRef = db.collection(Collections.userFeedThrottle).doc(topParentId);

	return db.runTransaction(async (transaction) => {
		const snapshot = await transaction.get(throttleRef);
		const previous = snapshot.exists ? (snapshot.data() as UserFeedThrottle) : undefined;
		if (previous && now - previous.lastFanoutAt < USER_FEED_ACTIVITY_WINDOW_MS) return false;

		const next: UserFeedThrottle = { statementId: topParentId, lastFanoutAt: now };
		transaction.set(throttleRef, next);

		return true;
	});
}

/**
 * Writes `fields` onto every doc in `collectionName` whose statementId is the
 * discussion, a page at a time (one batch per page). Returns the count written.
 */
async function stampMembers(
	db: Firestore,
	collectionName: Collections,
	topParentId: string,
	fields: Record<string, number>,
): Promise<number> {
	let written = 0;
	let cursor: QueryDocumentSnapshot | undefined;

	for (;;) {
		let page = db
			.collection(collectionName)
			.where('statementId', '==', topParentId)
			.orderBy('__name__')
			.select()
			.limit(USER_FEED_FANOUT_PAGE_SIZE);
		if (cursor) page = page.startAfter(cursor);

		const snapshot = await page.get();
		if (snapshot.empty) break;

		const batch: WriteBatch = db.batch();
		snapshot.docs.forEach((doc) => batch.update(doc.ref, fields));
		written += await commitTolerantly(batch, snapshot.docs, fields);

		if (snapshot.size < USER_FEED_FANOUT_PAGE_SIZE) break;
		cursor = snapshot.docs[snapshot.docs.length - 1];
	}

	return written;
}

/**
 * A member who leaves between the query and the commit makes the whole batch
 * fail with NOT_FOUND. Retry that page doc by doc and skip the missing ones —
 * never `set`, which would resurrect a deleted feed/subscription doc.
 */
async function commitTolerantly(
	batch: WriteBatch,
	docs: QueryDocumentSnapshot[],
	fields: Record<string, number>,
): Promise<number> {
	try {
		await batch.commit();

		return docs.length;
	} catch (error) {
		if ((error as { code?: number }).code !== NOT_FOUND_CODE) throw error;

		const results = await Promise.allSettled(docs.map((doc) => doc.ref.update(fields)));

		return results.filter((result) => result.status === 'fulfilled').length;
	}
}
