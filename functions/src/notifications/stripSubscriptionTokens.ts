import { Collections, type StatementSubscription } from '@freedi/shared-types';
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { logError } from '../utils/errorHandling';
import {
	GRPC_ALREADY_EXISTS,
	GRPC_NOT_FOUND,
	isUsablePushToken,
} from '../utils/removeSubscriptionTokens';

/** Marks a token document written because an old client sent the token with a new subscription. */
export const CREATED_SUBSCRIPTION_SOURCE = 'statementsSubscribe-created';

/**
 * Registers `token` for `userId` only when the token has no document yet. An
 * existing document is never changed: the device's real owner wrote it, and
 * claiming a device belongs to the person using it, not to the server.
 *
 * `lastUpdate` is a number for the reason given in backfillPushTokensFromSubscriptions:
 * the stale sweep skips it until the device next registers itself.
 *
 * Throws with the error code only: Firestore's text can quote the path, which holds the token.
 */
async function registerTokenIfMissing(
	ref: DocumentReference,
	token: string,
	userId: string,
): Promise<void> {
	try {
		await ref.create({
			token,
			userId,
			lastUpdate: Date.now(),
			source: CREATED_SUBSCRIPTION_SOURCE,
		});
	} catch (error) {
		const code = (error as { code?: number | string })?.code;
		if (code === GRPC_ALREADY_EXISTS) return;
		throw new Error(`Could not register a push token (code ${code})`);
	}
}

/**
 * Takes the old `tokens[]` field off a subscription a cached client just created.
 *
 * Any signed-in user can read a subscription, so the token must not stay there.
 * The rules cannot strip one field of a write, and refusing the write would stop
 * the old client joining, so the field is removed here, seconds after it lands.
 *
 * A push-enabled subscription's tokens are registered in `pushNotifications` first,
 * so a device known only from this write keeps receiving pushes. If that fails the
 * field stays (and so does the fallback) until the next cleanup run. Never throws.
 */
export async function stripCreatedSubscriptionTokens(
	firestore: Firestore,
	subscriptionId: string,
	subscription: Partial<StatementSubscription>,
): Promise<void> {
	const { tokens, userId, statementId } = subscription;
	if (tokens === undefined) return;

	try {
		if (subscription.getPushNotification === true && userId) {
			const collection = firestore.collection(Collections.pushNotifications);
			await Promise.all(
				tokens
					.filter(isUsablePushToken)
					.map((token) => registerTokenIfMissing(collection.doc(token), token, userId)),
			);
		}
		await firestore
			.collection(Collections.statementsSubscribe)
			.doc(subscriptionId)
			.update({ tokens: FieldValue.delete() });
	} catch (error) {
		// The person left again before the trigger ran: nothing is left to strip.
		if ((error as { code?: number | string })?.code === GRPC_NOT_FOUND) return;
		logError(error, {
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
