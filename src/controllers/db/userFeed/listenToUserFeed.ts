import {
	getDoc,
	getDocs,
	limit,
	orderBy,
	query,
	startAfter,
	where,
	type Query,
	type QueryDocumentSnapshot,
	type QuerySnapshot,
	type Unsubscribe,
} from 'firebase/firestore';
import { safeParse } from 'valibot';
import {
	Collections,
	StatementSubscription,
	StatementSubscriptionSchema,
	UserFeedItem,
	UserFeedItemSchema,
} from '@freedi/shared-types';
import { store } from '@/redux/store';
import {
	deleteSubscribedStatement,
	setStatementSubscription,
} from '@/redux/statements/statementsSlice';
import { upsertUserFeedItems } from '@/redux/userFeed/userFeedSlice';
import { HOME } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { createCollectionRef, createSubscriptionRef } from '@/utils/firebaseUtils';
import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';
import {
	createManagedCollectionListener,
	createManagedDocumentListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';
import { listenToStatementSubscriptions } from '@/controllers/db/subscriptions/getSubscriptions';

/**
 * Home "topics" list, ordered by ACTIVITY.
 *
 * Reads the user's `userFeed` (one small server-written doc per top-level
 * discussion, ordered by lastActivity) and then only the subscription docs of
 * that page — page-size reads, never an unbounded scan. The first page is
 * live: the feed query re-orders as discussions become active, and each
 * subscription on it has its own doc listener so role, notification and
 * read-state changes still arrive live.
 *
 * Replaces ordering `statementsSubscribe` by `lastUpdate`, which needed every
 * member's subscription stamped on every activity (and each stamp woke three
 * membership triggers).
 */

function feedQuery(userId: string): Query {
	return query(
		createCollectionRef(Collections.userFeed),
		where('userId', '==', userId),
		orderBy('lastActivity', 'desc'),
	);
}

function parseFeedDocs(docs: QueryDocumentSnapshot[]): UserFeedItem[] {
	const items: UserFeedItem[] = [];
	docs.forEach((doc) => {
		const result = safeParse(UserFeedItemSchema, doc.data());
		if (result.success) items.push(result.output);
	});

	return items;
}

function parseSubscription(data: unknown): StatementSubscription | undefined {
	const result = safeParse(StatementSubscriptionSchema, convertTimestampsToMillis(data));

	return result.success ? (result.output as StatementSubscription) : undefined;
}

function isPermissionDenied(error: unknown): boolean {
	return (error as { code?: string })?.code === 'permission-denied';
}

export function listenToUserFeed(
	userId: string,
	pageSize: number = HOME.INITIAL_SUBSCRIPTIONS_LIMIT,
): () => void {
	const dispatch = store.dispatch;
	const subscriptionListeners = new Map<string, Unsubscribe>();
	let legacyUnsubscribe: (() => void) | null = null;
	let isFirstSnapshot = true;

	const listenToSubscription = (item: UserFeedItem): void => {
		if (subscriptionListeners.has(item.subscriptionId)) return;
		const unsubscribe = createManagedDocumentListener(
			createSubscriptionRef(item.subscriptionId),
			generateListenerKey('home-feed', 'subscription', item.subscriptionId),
			(snapshot) => {
				if (!snapshot.exists()) {
					dispatch(deleteSubscribedStatement(item.statementId));

					return;
				}
				const subscription = parseSubscription(snapshot.data());
				if (subscription) dispatch(setStatementSubscription(subscription));
			},
			(error) => {
				if (!isPermissionDenied(error)) {
					logError(error, {
						operation: 'userFeed.listenToUserFeed.subscription',
						userId,
						statementId: item.statementId,
					});
				}
			},
		);
		subscriptionListeners.set(item.subscriptionId, unsubscribe);
	};

	const stopListeningToSubscription = (subscriptionId: string): void => {
		subscriptionListeners.get(subscriptionId)?.();
		subscriptionListeners.delete(subscriptionId);
	};

	const handleSnapshot = (snapshot: QuerySnapshot): void => {
		// Users not yet backfilled have no feed: fall back to the legacy
		// subscription-ordered listener so their home is never empty.
		if (isFirstSnapshot && snapshot.empty) {
			legacyUnsubscribe = listenToStatementSubscriptions(userId, pageSize);
		}
		isFirstSnapshot = false;

		snapshot.docChanges().forEach((change) => {
			if (change.type === 'removed') {
				const removed = change.doc.data() as Partial<UserFeedItem>;
				if (removed.subscriptionId) stopListeningToSubscription(removed.subscriptionId);
			}
		});

		const items = parseFeedDocs(snapshot.docs);
		if (items.length) dispatch(upsertUserFeedItems(items));
		items.forEach(listenToSubscription);
	};

	try {
		const unsubscribeFeed = createManagedCollectionListener(
			query(feedQuery(userId), limit(pageSize)),
			generateListenerKey('home-feed', 'user', `${userId}-${pageSize}`),
			handleSnapshot,
			(error) => {
				if (!isPermissionDenied(error)) {
					logError(error, { operation: 'userFeed.listenToUserFeed', userId });
				}
			},
			'query',
		);

		return () => {
			unsubscribeFeed();
			subscriptionListeners.forEach((unsubscribe) => unsubscribe());
			subscriptionListeners.clear();
			legacyUnsubscribe?.();
		};
	} catch (error) {
		logError(error, { operation: 'userFeed.listenToUserFeed', userId });

		return () => {};
	}
}

/**
 * One-time cursor fetch for OLDER topics (home infinite scroll): the next feed
 * page after `oldestLastActivity`, then exactly those subscription docs.
 * Reads: (batchSize + 1) feed docs + up to batchSize subscriptions.
 */
export async function fetchOlderUserFeed(
	userId: string,
	oldestLastActivity: number,
	batchSize: number = HOME.LOAD_MORE_BATCH_SIZE,
): Promise<{ hasMore: boolean }> {
	try {
		const dispatch = store.dispatch;
		const snapshot = await getDocs(
			query(feedQuery(userId), startAfter(oldestLastActivity), limit(batchSize + 1)),
		);
		const hasMore = snapshot.size > batchSize;
		const items = parseFeedDocs(hasMore ? snapshot.docs.slice(0, batchSize) : snapshot.docs);

		const subscriptions = await Promise.all(
			items.map(async (item) => {
				const subscriptionSnap = await getDoc(createSubscriptionRef(item.subscriptionId));

				return subscriptionSnap.exists() ? parseSubscription(subscriptionSnap.data()) : undefined;
			}),
		);
		subscriptions.forEach((subscription) => {
			if (subscription) dispatch(setStatementSubscription(subscription));
		});
		if (items.length) dispatch(upsertUserFeedItems(items));

		return { hasMore };
	} catch (error) {
		if (!isPermissionDenied(error)) {
			logError(error, { operation: 'userFeed.fetchOlderUserFeed', userId });
		}

		return { hasMore: false };
	}
}
