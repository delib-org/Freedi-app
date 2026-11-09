import { Collections, type StatementSubscription } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import type { Firestore } from 'firebase-admin/firestore';
import type { FcmSubscriber } from '../fn_notifications';
import { logError } from '../utils/errorHandling';

/** Firestore allows at most 30 values in an `in` filter. */
export const FIRESTORE_IN_MAX_VALUES = 30;

/** Token lookups running at once, so a very large fan-out does not open hundreds of queries. */
export const PUSH_TOKEN_LOOKUP_CONCURRENCY = 10;

/** One person to push to, with the tokens their subscription still carries. */
export interface PushRecipient {
	userId: string;
	subscriptionTokens?: readonly string[];
}

/**
 * The person a subscription belongs to. `userId` comes first because it is the
 * field the document id is built from; `user` can hold someone else on copies
 * written by the server, and a lookup by it would push to the wrong person's devices.
 */
export function pushRecipientFromSubscription(subscription: StatementSubscription): PushRecipient {
	return {
		userId: subscription.userId || subscription.user?.uid || '',
		subscriptionTokens: subscription.tokens,
	};
}

/** Splits `items` into consecutive groups of at most `size`. */
function chunk<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));

	return chunks;
}

/**
 * Reads one chunk of users' tokens. A failed read leaves those users with no
 * tokens here, which sends them to their subscription tokens: a Firestore error
 * costs them at most what they would have received before this collection was read.
 */
async function loadChunk(
	db: Firestore,
	userIds: string[],
	tokensByUser: Map<string, string[]>,
): Promise<void> {
	try {
		const snapshot = await db
			.collection(Collections.pushNotifications)
			.where('userId', 'in', userIds)
			.select('token', 'userId', 'app')
			.get();

		for (const doc of snapshot.docs) {
			const data = doc.data() as { token?: string; userId?: string; app?: string };
			// A doc tagged with `app` is that app's device (join-class shows only its
			// own data-only pushes), so statement fan-out must leave it alone.
			if (data.app || !data.userId) continue;

			const tokens = tokensByUser.get(data.userId) ?? [];
			tokens.push(data.token || doc.id);
			tokensByUser.set(data.userId, tokens);
		}
	} catch (error) {
		logError(error, {
			operation: 'notifications.resolveFcmSubscribers.loadChunk',
			metadata: { userCount: userIds.length },
		});
	}
}

/** Loads the statement-push tokens of every user, in the largest chunks Firestore allows. */
async function loadOwnedTokens(db: Firestore, userIds: string[]): Promise<Map<string, string[]>> {
	const tokensByUser = new Map<string, string[]>();
	const lookups = chunk(userIds, FIRESTORE_IN_MAX_VALUES);

	for (const group of chunk(lookups, PUSH_TOKEN_LOOKUP_CONCURRENCY)) {
		await Promise.all(group.map((ids) => loadChunk(db, ids, tokensByUser)));
	}

	return tokensByUser;
}

/**
 * Turns the people to notify into the device tokens to send to.
 *
 * Each person gets their `pushNotifications` tokens, or their subscription's
 * tokens only when they have none there. A token is sent once per fan-out: owned
 * tokens are placed first, so a device claimed by one recipient and still listed
 * on another's subscription gets one push, attributed to its real owner.
 *
 * Reads: one query per 30 distinct users, billed per token doc returned (an
 * empty query counts as one read). Never throws.
 */
export async function resolveFcmSubscribers(
	db: Firestore,
	recipients: readonly PushRecipient[],
): Promise<FcmSubscriber[]> {
	const subscriptionTokensByUser = new Map<string, Set<string>>();
	for (const { userId, subscriptionTokens } of recipients) {
		const tokens = subscriptionTokensByUser.get(userId) ?? new Set<string>();
		for (const token of subscriptionTokens ?? []) if (token) tokens.add(token);
		subscriptionTokensByUser.set(userId, tokens);
	}

	const userIds = [...subscriptionTokensByUser.keys()].filter(Boolean);
	if (subscriptionTokensByUser.size === 0) return [];

	const ownedTokens = await loadOwnedTokens(db, userIds);

	const subscribers: FcmSubscriber[] = [];
	const seenTokens = new Set<string>();
	const addToken = (userId: string, token: string): void => {
		if (seenTokens.has(token)) return;
		seenTokens.add(token);
		subscribers.push({ userId, token });
	};

	for (const [userId, tokens] of ownedTokens) {
		tokens.forEach((token) => addToken(userId, token));
	}

	const ownedCount = subscribers.length;
	let fallbackUsers = 0;
	for (const [userId, tokens] of subscriptionTokensByUser) {
		if (ownedTokens.has(userId) || tokens.size === 0) continue;
		fallbackUsers++;
		tokens.forEach((token) => addToken(userId, token));
	}

	// The fallback count is what shows when the old field is safe to retire.
	logger.info('Push tokens resolved', {
		recipients: subscriptionTokensByUser.size,
		ownedTokens: ownedCount,
		fallbackTokens: subscribers.length - ownedCount,
		fallbackUsers,
		lookupQueries: Math.ceil(userIds.length / FIRESTORE_IN_MAX_VALUES),
	});

	return subscribers;
}
