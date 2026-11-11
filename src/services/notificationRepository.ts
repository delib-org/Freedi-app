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
import { Collections } from '@freedi/shared-types';
import { DB, auth } from '@/controllers/db/config';
import { removeTokenFromSubscription } from '@/controllers/db/subscriptions/setSubscriptions';
import { getDeviceInfo, type PushPlatform } from './platformService';
import { logError } from '@/utils/errorHandling';

/**
 * Quiet hours configuration for push notifications.
 */
export interface QuietHoursConfig {
	enabled: boolean;
	startTime: string; // HH:mm format (e.g., "22:00")
	endTime: string; // HH:mm format (e.g., "08:00")
	timezone: string; // IANA timezone (e.g., "America/New_York")
}

/**
 * Metadata stored with each FCM token.
 */
export interface TokenMetadata {
	token: string;
	userId: string;
	lastUpdate: Date | Timestamp;
	lastRefresh: Date | Timestamp;
	platform: PushPlatform;
	deviceInfo: {
		userAgent: string;
		language: string;
	};
	quietHours?: QuietHoursConfig;
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
	try {
		const tokenDoc = await getDoc(doc(DB, 'pushNotifications', token));

		if (!tokenDoc.exists()) {
			return null;
		}

		return tokenDoc.data() as TokenMetadata;
	} catch (error) {
		// This browser's token is still registered to the last person who signed
		// in here, and the rules hide that document. To us it is unregistered:
		// null sends the caller to storeToken, which takes it over.
		if ((error as { code?: string })?.code === 'permission-denied') {
			return null;
		}

		throw error;
	}
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
			logError(error, {
				operation: 'services.notificationRepository.deleteToken',
				metadata: { message: 'Error deleting push notification doc:' },
			});
		}
	}
};

/**
 * Register for statement notifications.
 * Pushes are delivered from the owner-only pushNotifications collection, so this
 * makes sure the device is registered there. The token is never written to
 * statementsSubscribe, which more people than its owner can read (those in the
 * statement, hosts).
 * Also maintains legacy askedToBeNotified for backward compatibility during migration.
 */
export const registerForStatementNotifications = async (
	userId: string,
	token: string,
	statementId: string,
): Promise<void> => {
	await storeToken(userId, token);

	// Also update legacy collection for backward compatibility during migration
	// TODO: Remove this after migration is complete
	const notificationRef = doc(DB, Collections.askedToBeNotified, `${token}_${statementId}`);
	try {
		await setDoc(
			notificationRef,
			{
				token,
				userId,
				statementId,
				lastUpdate: new Date(),
				subscribed: true,
			},
			{ merge: true },
		);
	} catch (error) {
		// On a shared browser this document can still belong to the last person
		// who signed in here, and the rules keep it theirs. Registration is
		// already done: push is delivered from pushNotifications, never from this legacy doc.
		if ((error as { code?: string })?.code !== 'permission-denied') {
			throw error;
		}
	}
};

/**
 * Unregister from statement notifications.
 * Removes the FCM token from the old statementsSubscribe.tokens[] list, so a
 * device still listed there stops being a fallback push target.
 * Also cleans up legacy askedToBeNotified collection.
 */
export const unregisterFromStatementNotifications = async (
	token: string,
	statementId: string,
	userId: string,
): Promise<void> => {
	await removeTokenFromSubscription(statementId, userId, token);

	// Also clean up legacy collection
	// TODO: Remove this after migration is complete
	try {
		const notificationRef = doc(DB, Collections.askedToBeNotified, `${token}_${statementId}`);
		await deleteDoc(notificationRef);
	} catch (error) {
		// Silently handle a legacy doc that is gone or still belongs to the last
		// person who signed in on this browser
		const err = error as { code?: string };
		if (err?.code !== 'not-found' && err?.code !== 'permission-denied') {
			logError(error, {
				operation: 'services.notificationRepository.unregisterFromStatementNotifications',
				metadata: { message: 'Error cleaning up legacy notification doc:' },
			});
		}
	}
};

/**
 * Remove token from all user's subscriptions (used on logout or token refresh).
 */
export const removeTokenFromAllSubscriptions = async (
	userId: string,
	token: string,
): Promise<void> => {
	// Validate inputs
	if (!userId || !token) {
		return;
	}

	// Guard: skip if user is no longer authenticated (prevents "Missing or insufficient permissions")
	if (!auth.currentUser) {
		console.info('[NotificationRepository] Skipping token removal - user not authenticated');

		return;
	}

	// Get all user's subscriptions
	const subscriptionsQuery = query(
		collection(DB, Collections.statementsSubscribe),
		where('userId', '==', userId),
	);

	const subscriptionsSnapshot = await getDocs(subscriptionsQuery);

	// Remove the token where it is still listed; the other subscriptions need no read or write
	const removePromises = subscriptionsSnapshot.docs.map((docSnapshot) => {
		const subscription = docSnapshot.data();
		const statementId = subscription.statementId || subscription.statement?.statementId;
		const listedTokens: unknown = subscription.tokens;

		if (!statementId || !Array.isArray(listedTokens) || !listedTokens.includes(token)) {
			return Promise.resolve();
		}

		return removeTokenFromSubscription(statementId, userId, token).catch((err) => {
			// Silently handle individual subscription errors
			if (!err?.message?.includes('Null value error')) {
				logError(err, {
					operation: 'services.notificationRepository.removePromises',
					metadata: { message: 'Error removing token from subscription ${statementId}:' },
				});
			}
		});
	});

	await Promise.allSettled(removePromises);
};

/**
 * Save quiet hours configuration for a user.
 * This updates all tokens belonging to the user.
 */
export const saveQuietHours = async (userId: string, config: QuietHoursConfig): Promise<void> => {
	// Get all tokens for this user
	const tokensQuery = query(collection(DB, 'pushNotifications'), where('userId', '==', userId));

	const tokensSnapshot = await getDocs(tokensQuery);

	if (tokensSnapshot.empty) {
		console.info('No tokens found for user to update quiet hours');

		return;
	}

	// Batch update all user's tokens with quiet hours
	const batch = writeBatch(DB);
	tokensSnapshot.docs.forEach((docSnapshot) => {
		batch.update(docSnapshot.ref, {
			quietHours: config,
			lastUpdate: new Date(),
		});
	});

	await batch.commit();
	console.info(`Updated quiet hours for ${tokensSnapshot.size} token(s)`);
};

/**
 * Get quiet hours configuration for a user.
 * Returns the config from any of the user's tokens.
 */
export const getQuietHours = async (userId: string): Promise<QuietHoursConfig | null> => {
	const tokensQuery = query(collection(DB, 'pushNotifications'), where('userId', '==', userId));

	const tokensSnapshot = await getDocs(tokensQuery);

	if (tokensSnapshot.empty) {
		return null;
	}

	// Return quiet hours from the first token (they should all be the same)
	const tokenData = tokensSnapshot.docs[0].data() as TokenMetadata;

	return tokenData.quietHours || null;
};

/**
 * Check if current time is within quiet hours for a user.
 */
export const isInQuietHours = (config: QuietHoursConfig): boolean => {
	if (!config.enabled) {
		return false;
	}

	try {
		// Get current time in user's timezone
		const now = new Date();
		const formatter = new Intl.DateTimeFormat('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: config.timezone,
		});

		const parseHHMM = (value: string | undefined): [number, number] => {
			const [h, m] = (value ?? '').split(':').map(Number);

			return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
		};

		const currentTime = formatter.format(now);
		const [currentHour, currentMinute] = parseHHMM(currentTime);
		const currentMinutes = currentHour * 60 + currentMinute;

		const [startHour, startMinute] = parseHHMM(config.startTime);
		const startMinutes = startHour * 60 + startMinute;

		const [endHour, endMinute] = parseHHMM(config.endTime);
		const endMinutes = endHour * 60 + endMinute;

		// Handle overnight quiet hours (e.g., 22:00 - 08:00)
		if (startMinutes > endMinutes) {
			// Quiet hours span midnight
			return currentMinutes >= startMinutes || currentMinutes < endMinutes;
		} else {
			// Quiet hours within same day
			return currentMinutes >= startMinutes && currentMinutes < endMinutes;
		}
	} catch (error) {
		logError(error, {
			operation: 'services.notificationRepository.isInQuietHours',
			metadata: { message: 'Error checking quiet hours:' },
		});

		return false;
	}
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
	removeTokenFromAllSubscriptions,
	saveQuietHours,
	getQuietHours,
	isInQuietHours,
} as const;
