import { Collections } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import type { Firestore } from 'firebase-admin/firestore';
import type { FcmSubscriber } from '../fn_notifications';
import { logError } from '../utils/errorHandling';
import {
	removeTokensFromUserSubscriptions,
	SUBSCRIPTION_TOKEN_BATCH_SIZE,
} from '../utils/removeSubscriptionTokens';

/** Firestore error text can quote a document path, and these paths contain the token. */
function errorCodeOnly(error: unknown): Error {
	const code = (error as { code?: string | number })?.code ?? 'unknown';

	return new Error(`Firestore write failed with code ${code}`);
}

/** Deletes `pushNotifications/{token}` for each token, one write batch at a time. */
async function removeFromPushNotifications(db: Firestore, tokens: string[]): Promise<void> {
	for (let i = 0; i < tokens.length; i += SUBSCRIPTION_TOKEN_BATCH_SIZE) {
		const chunk = tokens.slice(i, i + SUBSCRIPTION_TOKEN_BATCH_SIZE);
		try {
			const batch = db.batch();
			chunk.forEach((token) =>
				batch.delete(db.collection(Collections.pushNotifications).doc(token)),
			);
			await batch.commit();
		} catch (error) {
			logError(errorCodeOnly(error), {
				operation: 'notifications.removeInvalidTokens.removeFromPushNotifications',
				metadata: { tokenCount: chunk.length },
			});
		}
	}
}

/** Removes one user's invalid tokens from the `tokens[]` of their subscriptions. */
async function removeFromUserSubscriptions(
	db: Firestore,
	userId: string,
	tokens: string[],
): Promise<void> {
	try {
		const updated = await removeTokensFromUserSubscriptions(db, userId, tokens);
		logger.info(
			`Removed ${tokens.length} invalid tokens from ${updated} of ${userId}'s subscriptions`,
		);
	} catch (error) {
		logError(errorCodeOnly(error), {
			operation: 'notifications.removeInvalidTokens.removeFromUserSubscriptions',
			userId,
			metadata: { tokenCount: tokens.length },
		});
	}
}

/**
 * Removes tokens FCM rejected from both places a token can live:
 * `pushNotifications/{token}` and the owner's `statementsSubscribe.tokens[]`.
 * The second place stays for as long as sending can fall back to it.
 *
 * Never throws: the push has already gone out, and a token left behind is
 * rejected and cleaned again on the next send.
 */
export async function removeInvalidTokens(
	db: Firestore,
	invalidTokens: readonly FcmSubscriber[],
): Promise<void> {
	if (invalidTokens.length === 0) return;

	await removeFromPushNotifications(db, [...new Set(invalidTokens.map(({ token }) => token))]);

	const tokensByUser = new Map<string, string[]>();
	for (const { userId, token } of invalidTokens) {
		tokensByUser.set(userId, [...(tokensByUser.get(userId) ?? []), token]);
	}
	await Promise.all(
		[...tokensByUser].map(([userId, tokens]) => removeFromUserSubscriptions(db, userId, tokens)),
	);

	logger.info(`Removed ${invalidTokens.length} invalid tokens from all collections`);
}
