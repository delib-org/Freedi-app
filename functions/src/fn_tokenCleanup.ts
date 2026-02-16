/**
 * Scheduled function to clean up stale FCM tokens.
 *
 * This function runs daily and removes tokens that:
 * 1. Haven't been updated in 60+ days (pushNotifications collection)
 * 2. Removes stale tokens from statementsSubscribe.tokens[] arrays
 * 3. Cleans up legacy askedToBeNotified entries
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v1';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';

const db = getFirestore();

// Token is considered stale if not updated in 60 days
const STALE_TOKEN_THRESHOLD_MS = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds

interface TokenCleanupResult {
	staleTokensFound: number;
	tokensRemovedFromPushNotifications: number;
	tokensRemovedFromSubscriptions: number;
	tokensRemovedFromLegacy: number;
	errors: string[];
}

/**
 * Scheduled function that runs daily at 3:00 AM UTC to clean up stale tokens.
 */
export const cleanupStaleTokens = onSchedule(
	{
		schedule: '0 3 * * *', // Run at 3:00 AM UTC every day
		timeZone: 'UTC',
		retryCount: 3,
		memory: '512MiB',
	},
	async (): Promise<void> => {
		const startTime = Date.now();
		logger.info('Starting scheduled stale token cleanup');

		const result = await performTokenCleanup();

		const duration = Date.now() - startTime;
		logger.info('Token cleanup completed', {
			...result,
			durationMs: duration,
		});
	},
);

/**
 * Performs the actual token cleanup.
 * Can also be called from an HTTP endpoint for manual cleanup.
 */
export async function performTokenCleanup(): Promise<TokenCleanupResult> {
	const result: TokenCleanupResult = {
		staleTokensFound: 0,
		tokensRemovedFromPushNotifications: 0,
		tokensRemovedFromSubscriptions: 0,
		tokensRemovedFromLegacy: 0,
		errors: [],
	};

	try {
		// Step 1: Find stale tokens in pushNotifications collection
		const staleThreshold = Date.now() - STALE_TOKEN_THRESHOLD_MS;
		const staleDate = new Date(staleThreshold);

		logger.info(`Looking for tokens not updated since: ${staleDate.toISOString()}`);

		const staleTokensSnapshot = await db
			.collection('pushNotifications')
			.where('lastUpdate', '<', staleDate)
			.get();

		result.staleTokensFound = staleTokensSnapshot.size;

		if (staleTokensSnapshot.empty) {
			logger.info('No stale tokens found');

			return result;
		}

		logger.info(`Found ${result.staleTokensFound} stale tokens to clean up`);

		// Step 2: Group tokens by userId for efficient subscription updates
		const tokensByUser = new Map<string, string[]>();
		const allStaleTokens: string[] = [];

		for (const doc of staleTokensSnapshot.docs) {
			const data = doc.data();
			const token = data.token || doc.id;
			const userId = data.userId;

			allStaleTokens.push(token);

			if (userId) {
				const tokens = tokensByUser.get(userId) || [];
				tokens.push(token);
				tokensByUser.set(userId, tokens);
			}
		}

		// Step 3: Delete from pushNotifications collection (batch of 500)
		const batchSize = 500;
		for (let i = 0; i < staleTokensSnapshot.docs.length; i += batchSize) {
			const batch = db.batch();
			const batchDocs = staleTokensSnapshot.docs.slice(i, i + batchSize);

			for (const doc of batchDocs) {
				batch.delete(doc.ref);
			}

			await batch.commit();
			result.tokensRemovedFromPushNotifications += batchDocs.length;
		}

		logger.info(
			`Deleted ${result.tokensRemovedFromPushNotifications} tokens from pushNotifications`,
		);

		// Step 4: Remove stale tokens from statementsSubscribe.tokens[] arrays
		for (const [userId, tokens] of tokensByUser) {
			try {
				const removed = await removeTokensFromUserSubscriptions(userId, tokens);
				result.tokensRemovedFromSubscriptions += removed;
			} catch (error) {
				const errorMsg = `Error removing tokens for user ${userId}: ${error}`;
				logger.error(errorMsg);
				result.errors.push(errorMsg);
			}
		}

		logger.info(`Removed tokens from ${result.tokensRemovedFromSubscriptions} subscriptions`);

		// Step 5: Clean up legacy askedToBeNotified entries
		for (const token of allStaleTokens) {
			try {
				const legacyDocsSnapshot = await db
					.collection(Collections.askedToBeNotified)
					.where('token', '==', token)
					.get();

				if (!legacyDocsSnapshot.empty) {
					const batch = db.batch();
					for (const doc of legacyDocsSnapshot.docs) {
						batch.delete(doc.ref);
					}
					await batch.commit();
					result.tokensRemovedFromLegacy += legacyDocsSnapshot.size;
				}
			} catch (error) {
				// Continue with other tokens even if one fails
				logger.warn(`Error cleaning up legacy entry for token: ${error}`);
			}
		}

		logger.info(`Cleaned up ${result.tokensRemovedFromLegacy} legacy askedToBeNotified entries`);

		return result;
	} catch (error) {
		const errorMsg = `Token cleanup failed: ${error}`;
		logger.error(errorMsg);
		result.errors.push(errorMsg);

		return result;
	}
}

/**
 * Removes stale tokens from all subscriptions for a specific user.
 * Returns the number of subscriptions updated.
 */
async function removeTokensFromUserSubscriptions(
	userId: string,
	tokens: string[],
): Promise<number> {
	const subscriptionsSnapshot = await db
		.collection(Collections.statementsSubscribe)
		.where('userId', '==', userId)
		.get();

	if (subscriptionsSnapshot.empty) {
		return 0;
	}

	let updatedCount = 0;
	const batchSize = 500;
	let batch = db.batch();
	let operationCount = 0;

	for (const docSnapshot of subscriptionsSnapshot.docs) {
		const subscription = docSnapshot.data();
		const currentTokens: string[] = subscription.tokens || [];

		// Check if any of the stale tokens are in this subscription
		const hasStaleTokens = tokens.some((token) => currentTokens.includes(token));

		if (hasStaleTokens) {
			// Use FieldValue.arrayRemove to remove multiple tokens
			batch.update(docSnapshot.ref, {
				tokens: FieldValue.arrayRemove(...tokens),
				lastUpdate: Date.now(),
			});
			operationCount++;
			updatedCount++;

			// Commit batch if we hit the limit
			if (operationCount >= batchSize) {
				await batch.commit();
				batch = db.batch();
				operationCount = 0;
			}
		}
	}

	// Commit remaining operations
	if (operationCount > 0) {
		await batch.commit();
	}

	return updatedCount;
}
