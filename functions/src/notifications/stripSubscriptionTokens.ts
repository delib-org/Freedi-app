import { Collections, type StatementSubscription } from '@freedi/shared-types';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logError } from '../utils/errorHandling';
import { GRPC_NOT_FOUND, isUsablePushToken } from '../utils/removeSubscriptionTokens';

/** The tokens on a subscription that the push fallback still delivers to. */
function deliveringTokens(subscription: Partial<StatementSubscription>): string[] {
	if (subscription.getPushNotification !== true) return [];

	return (subscription.tokens ?? []).filter(isUsablePushToken);
}

/** True when every token has a `pushNotifications` document, whoever owns it. */
async function allTokensRegistered(firestore: Firestore, tokens: string[]): Promise<boolean> {
	if (tokens.length === 0) return true;
	const collection = firestore.collection(Collections.pushNotifications);
	const snapshots = await firestore.getAll(...tokens.map((token) => collection.doc(token)));

	return snapshots.every((snapshot) => snapshot.exists);
}

/**
 * Takes the old `tokens[]` field off a subscription a cached client just created.
 *
 * Any signed-in user can read a subscription, so the token must not stay there.
 * The rules cannot strip one field of a write, and refusing the write would stop
 * the old client joining, so the field is removed here, seconds after it lands.
 *
 * This never registers a token: if a delivering token has no `pushNotifications`
 * document the field stays, so the fallback still reaches that device, and the
 * cleanup script handles it. A server registration would hand an unclaimed token
 * to whoever named it on their own subscription. An old client registers its
 * token before it joins, so this is the rare case. Never throws.
 */
export async function stripCreatedSubscriptionTokens(
	firestore: Firestore,
	subscriptionId: string,
	subscription: Partial<StatementSubscription>,
): Promise<void> {
	const { tokens, userId, statementId } = subscription;
	if (tokens === undefined) return;

	try {
		if (!(await allTokensRegistered(firestore, deliveringTokens(subscription)))) return;

		await firestore
			.collection(Collections.statementsSubscribe)
			.doc(subscriptionId)
			.update({ tokens: FieldValue.delete() });
	} catch (error) {
		const code = (error as { code?: number | string })?.code;
		// The person left again before the trigger ran: nothing is left to strip.
		if (code === GRPC_NOT_FOUND) return;
		// The code only: Firestore's text can quote a path, which can hold a token.
		logError(new Error(`Could not strip push tokens (code ${code})`), {
			operation: 'notifications.stripCreatedSubscriptionTokens',
			userId,
			statementId,
			metadata: { subscriptionId },
		});
	}
}

/** A copy of `data` without the old token list, for documents written from a subscription. */
export function withoutPushTokens<T extends { tokens?: unknown }>(data: T): Omit<T, 'tokens'> {
	const copy = { ...data };
	delete copy.tokens;

	return copy;
}
