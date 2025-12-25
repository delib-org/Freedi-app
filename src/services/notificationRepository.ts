/**
 * Repository for notification-related Firestore operations.
 *
 * Responsibilities:
 * - Store/update FCM tokens in pushNotifications collection
 * - Manage statement notification subscriptions
 * - Handle token cleanup on logout
 * - Query user subscriptions
 *
 * This repository follows Single Responsibility Principle (SRP) by focusing
 * only on data persistence, extracted from NotificationService.
 */

import {
	setDoc,
	doc,
	deleteDoc,
	getDoc,
	getDocs,
	query,
	where,
	collection,
	writeBatch,
	Timestamp,
} from 'firebase/firestore';
import { Collections } from 'delib-npm';
import { DB } from '@/controllers/db/config';
import { removeTokenFromSubscription } from '@/controllers/db/subscriptions/setSubscriptions';
import { getDeviceInfo } from './platformService';
import { FIREBASE } from '@/constants/common';

/**
 * Metadata stored with each FCM token.
 */
export interface TokenMetadata {
	token: string;
	userId: string;
	lastUpdate: Date | Timestamp;
	lastRefresh: Date | Timestamp;
	platform: string;
	deviceInfo: {
		userAgent: string;
		language: string;
	};
}

/**
 * Convert Firestore Timestamp or Date to JavaScript Date.
 */
const convertToDate = (dateOrTimestamp: Date | Timestamp | undefined): Date | null => {
	if (!dateOrTimestamp) return null;

	if (dateOrTimestamp instanceof Date) {
		return dateOrTimestamp;
	}

	// Check if it's a Firestore Timestamp (has toDate method)
	if (typeof dateOrTimestamp === 'object' && 'toDate' in dateOrTimestamp) {
		return dateOrTimestamp.toDate();
	}

	return null;
};

/**
 * Store an FCM token in the pushNotifications collection.
 */
export const storeToken = async (userId: string, token: string): Promise<void> => {
	const { platform, ...deviceInfo } = getDeviceInfo();
	const tokenMetadata: TokenMetadata = {
		token,
		userId,
		lastUpdate: new Date(),
		lastRefresh: new Date(),
		platform,
		deviceInfo,
	};

	await setDoc(doc(DB, 'pushNotifications', token), tokenMetadata, { merge: true });
};

/**
 * Get token metadata from the database.
 */
export const getTokenMetadata = async (token: string): Promise<TokenMetadata | null> => {
	const tokenDoc = await getDoc(doc(DB, 'pushNotifications', token));

	if (!tokenDoc.exists()) {
		return null;
	}

	return tokenDoc.data() as TokenMetadata;
};

/**
 * Get the last refresh time for a token.
 */
export const getTokenLastRefresh = async (token: string): Promise<Date | null> => {
	const metadata = await getTokenMetadata(token);

	if (!metadata) return null;

	return convertToDate(metadata.lastRefresh) || convertToDate(metadata.lastUpdate);
};

/**
 * Delete a token from the database.
 */
export const deleteToken = async (token: string): Promise<void> => {
	try {
		const docRef = doc(DB, 'pushNotifications', token);
		await deleteDoc(docRef);
	} catch (error) {
		// Silently handle if document doesn't exist
		const err = error as { code?: string };
		if (err?.code !== 'permission-denied' && err?.code !== 'not-found') {
			console.error('Error deleting push notification doc:', error);
		}
	}
};

/**
 * Register for statement notifications.
 */
export const registerForStatementNotifications = async (
	userId: string,
	token: string,
	statementId: string
): Promise<void> => {
	const notificationRef = doc(DB, Collections.askedToBeNotified, `${token}_${statementId}`);
	await setDoc(
		notificationRef,
		{
			token,
			userId,
			statementId,
			lastUpdate: new Date(),
			subscribed: true,
		},
		{ merge: true }
	);
};

/**
 * Unregister from statement notifications.
 */
export const unregisterFromStatementNotifications = async (
	token: string,
	statementId: string,
	userId: string
): Promise<void> => {
	const notificationRef = doc(DB, Collections.askedToBeNotified, `${token}_${statementId}`);
	await deleteDoc(notificationRef);

	// Also remove token from statement subscription
	await removeTokenFromSubscription(statementId, userId, token);
};

/**
 * Sync token with all user's statement subscriptions.
 */
export const syncTokenWithSubscriptions = async (
	userId: string,
	token: string
): Promise<number> => {
	const subscriptionsQuery = query(
		collection(DB, Collections.statementsSubscribe),
		where('userId', '==', userId),
		where('getPushNotification', '==', true)
	);

	const subscriptionsSnapshot = await getDocs(subscriptionsQuery);

	// Batch updates for efficiency (Firestore allows max 500 per batch)
	const BATCH_SIZE = FIREBASE.BATCH_SIZE;
	const batches: Promise<void>[] = [];
	let currentBatch = writeBatch(DB);
	let operationCount = 0;

	for (const docSnapshot of subscriptionsSnapshot.docs) {
		const subscription = docSnapshot.data();
		const statementId = subscription.statementId || subscription.statement?.statementId;

		if (!statementId) {
			console.error('No statementId found in subscription:', docSnapshot.id);
			continue;
		}

		// Update the subscription with the token
		const subscriptionRef = docSnapshot.ref;
		currentBatch.update(subscriptionRef, {
			token,
			lastTokenUpdate: new Date(),
		});

		operationCount++;

		// If we've hit the batch limit, start a new batch
		if (operationCount % BATCH_SIZE === 0) {
			batches.push(currentBatch.commit());
			currentBatch = writeBatch(DB);
		}
	}

	// Commit the last batch if it has operations
	if (operationCount % BATCH_SIZE !== 0) {
		batches.push(currentBatch.commit());
	}

	// Execute all batches
	await Promise.all(batches);

	console.info(`Synced token with ${operationCount} subscriptions in ${batches.length} batch(es)`);

	return operationCount;
};

/**
 * Remove token from all user's subscriptions (used on logout or token refresh).
 */
export const removeTokenFromAllSubscriptions = async (
	userId: string,
	token: string
): Promise<void> => {
	// Validate inputs
	if (!userId || !token) {
		return;
	}

	// Get all user's subscriptions
	const subscriptionsQuery = query(
		collection(DB, Collections.statementsSubscribe),
		where('userId', '==', userId)
	);

	const subscriptionsSnapshot = await getDocs(subscriptionsQuery);

	// Remove token from all subscriptions
	const removePromises = subscriptionsSnapshot.docs.map((docSnapshot) => {
		const subscription = docSnapshot.data();
		const statementId = subscription.statementId || subscription.statement?.statementId;

		if (!statementId) {
			return Promise.resolve();
		}

		return removeTokenFromSubscription(statementId, userId, token).catch((err) => {
			// Silently handle individual subscription errors
			if (!err?.message?.includes('Null value error')) {
				console.error(`Error removing token from subscription ${statementId}:`, err);
			}
		});
	});

	await Promise.allSettled(removePromises);
};

/**
 * NotificationRepository singleton for convenience.
 */
export const NotificationRepository = {
	storeToken,
	getTokenMetadata,
	getTokenLastRefresh,
	deleteToken,
	registerForStatementNotifications,
	unregisterFromStatementNotifications,
	syncTokenWithSubscriptions,
	removeTokenFromAllSubscriptions,
} as const;
