import {
	Collections,
	NotificationType,
	Statement,
	StatementSchema,
	StatementSubscription,
} from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { parse } from 'valibot';
import { db } from './index';
import { FirestoreEvent } from 'firebase-functions/v2/firestore';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { getDefaultQuestionType } from './model/questionTypeDefaults';

export interface FcmSubscriber {
	userId: string;
	token: string;
	documentId?: string;
}

interface SendResult {
	successful: number;
	failed: number;
	invalidTokens: string[];
}

/**
 * Quiet hours configuration stored with FCM tokens.
 */
interface QuietHoursConfig {
	enabled: boolean;
	startTime: string; // HH:mm format
	endTime: string; // HH:mm format
	timezone: string; // IANA timezone
}

/**
 * Check if current time is within quiet hours for a user.
 */
function isInQuietHours(config: QuietHoursConfig | undefined): boolean {
	if (!config || !config.enabled) {
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

		const currentTime = formatter.format(now);
		const [currentHour, currentMinute] = currentTime.split(':').map(Number);
		const currentMinutes = currentHour * 60 + currentMinute;

		const [startHour, startMinute] = config.startTime.split(':').map(Number);
		const startMinutes = startHour * 60 + startMinute;

		const [endHour, endMinute] = config.endTime.split(':').map(Number);
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
		logger.error('Error checking quiet hours:', error);

		return false;
	}
}

/**
 * Filter FCM subscribers by quiet hours - removes subscribers currently in quiet hours.
 */
async function filterByQuietHours(subscribers: FcmSubscriber[]): Promise<FcmSubscriber[]> {
	if (subscribers.length === 0) return [];

	// Get unique user IDs to batch fetch quiet hours
	const userIds = [...new Set(subscribers.map((s) => s.userId))];
	const quietHoursMap = new Map<string, QuietHoursConfig | null>();

	// Batch fetch quiet hours for all users (using tokens)
	const fetchPromises = userIds.map(async (userId) => {
		try {
			const tokensSnapshot = await db
				.collection(Collections.pushNotifications)
				.where('userId', '==', userId)
				.limit(1)
				.get();

			if (!tokensSnapshot.empty) {
				const tokenData = tokensSnapshot.docs[0].data();
				quietHoursMap.set(userId, (tokenData.quietHours as QuietHoursConfig | undefined) || null);
			} else {
				quietHoursMap.set(userId, null);
			}
		} catch (error) {
			logger.warn(`Error fetching quiet hours for user ${userId}:`, error);
			quietHoursMap.set(userId, null);
		}
	});

	await Promise.all(fetchPromises);

	// Filter out subscribers who are in quiet hours
	return subscribers.filter((subscriber) => {
		const quietHours = quietHoursMap.get(subscriber.userId);

		return !isInQuietHours(quietHours || undefined);
	});
}

/**
 * Updates in-app notifications when a new statement is created as a reply.
 * Creates notifications for users subscribed to the parent statement.
 */
export async function updateInAppNotifications(
	e: FirestoreEvent<QueryDocumentSnapshot>,
): Promise<void> {
	try {
		//go to the new statement and parse it
		const newStatement = e.data?.data() as Statement;
		const statement = parse(StatementSchema, newStatement);

		const MAX_NOTIFICATION_SUBSCRIBERS = 500;

		// Fetch direct parent subscribers + parent statement in parallel
		// Only fetch from direct parent — subscribers to ancestor statements are already
		// subscribed to the parent via the subscription inheritance system.
		const [subscribersDB, parentStatementDB, pushSubscribersDB] = await fetchNotificationData(
			statement.parentId,
			MAX_NOTIFICATION_SUBSCRIBERS,
		);

		const subscribersInApp = subscribersDB.docs.map(
			(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription,
		);

		// Handle top-level statements (no parent) and check if parent exists
		let parentStatement: Statement | null = null;
		if (statement.parentId === 'top') {
			// For top-level statements, we don't have a parent statement
			// Skip parent-specific logic
		} else if (!parentStatementDB.exists) {
			logger.error(`Parent statement ${statement.parentId} not found`);

			return;
		} else {
			parentStatement = parse(StatementSchema, parentStatementDB.data());
		}

		// Deduplicate subscribers by userId
		const seenUserIds = new Set<string>();
		const allSubscribers = subscribersInApp.filter((subscriber) => {
			if (seenUserIds.has(subscriber.user.uid)) {
				return false;
			}
			seenUserIds.add(subscriber.user.uid);

			return true;
		});

		// Get push notification subscribers (already capped by fetchNotificationData)
		const pushSubscribers = pushSubscribersDB.docs.map(
			(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription,
		);

		// Convert to FCM subscriber format
		const fcmSubscribers: FcmSubscriber[] = [];
		pushSubscribers.forEach((subscriber) => {
			if (subscriber.tokens && subscriber.tokens.length > 0) {
				subscriber.tokens.forEach((token) => {
					fcmSubscribers.push({
						userId: subscriber.userId,
						token: token,
						documentId: `${subscriber.userId}_${statement.parentId}`,
					});
				});
			}
		});

		//update last message in the parent statement (only if not top-level)
		if (statement.parentId !== 'top') {
			await db.doc(`${Collections.statements}/${statement.parentId}`).update({
				lastMessage: {
					message: newStatement.statement,
					creator: newStatement.creator.displayName || 'Anonymous',
					createdAt: newStatement.createdAt,
				},
			});
		}

		// Process notifications
		await processInAppNotifications(allSubscribers, newStatement, parentStatement);

		// Process FCM notifications with improved error handling
		await processFcmNotificationsImproved(fcmSubscribers, newStatement, parentStatement);
	} catch (error) {
		logger.error('Error in updateInAppNotifications:', error);
	}
}

/**
 * Fetches all data needed for notification processing in parallel.
 * Queries are capped with a limit to prevent runaway reads.
 */
async function fetchNotificationData(parentId: string, subscriberLimit: number = 500) {
	// Query for in-app notification subscribers (capped)
	const parentStatementSubscribersCB = db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', parentId)
		.where('getInAppNotification', '==', true)
		.limit(subscriberLimit)
		.get();

	// Query for push notification subscribers (capped)
	const pushStatementSubscribersCB = db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', parentId)
		.where('getPushNotification', '==', true)
		.limit(subscriberLimit)
		.get();

	const parentStatementCB = db.doc(`${Collections.statements}/${parentId}`).get();

	return await Promise.all([
		parentStatementSubscribersCB,
		parentStatementCB,
		pushStatementSubscribersCB,
	]);
}

/**
 * Creates in-app notifications using batch write operation.
 */
async function processInAppNotifications(
	subscribersInApp: StatementSubscription[],
	newStatement: Statement,
	parentStatement: Statement | null,
) {
	//here we should have all the subscribers for the parent notification

	const batch = db.batch();
	const seenUserIds = new Set<string>();

	// Create notification for each subscriber
	// Use deterministic IDs to prevent duplicates if the function fires more than once
	subscribersInApp.forEach((subscriber: StatementSubscription) => {
		// Skip duplicate subscribers
		if (seenUserIds.has(subscriber.user.uid)) return;
		seenUserIds.add(subscriber.user.uid);

		// Deterministic ID: ensures idempotency if function retries
		const notificationId = `${subscriber.user.uid}_${newStatement.statementId}`;
		const notificationRef = db.collection(Collections.inAppNotifications).doc(notificationId);

		const questionType = newStatement.questionSettings?.questionType ?? getDefaultQuestionType();

		const newNotification: NotificationType = {
			userId: subscriber.user.uid,
			parentId: newStatement.parentId,
			parentStatement: parentStatement ? parentStatement.statement : 'top',
			statementType: newStatement.statementType,
			questionType: questionType,
			text: newStatement.statement,
			creatorId: newStatement.creator.uid,
			creatorName: newStatement.creator.displayName,
			creatorImage: newStatement.creator.photoURL,
			createdAt: newStatement.createdAt,
			read: false,
			notificationId: notificationId,
			statementId: newStatement.statementId,
			viewedInList: false,
			viewedInContext: false,
		};
		batch.set(notificationRef, newNotification);
	});

	await batch.commit();
}

// REMOVED: validateTokens — was sending a dry-run FCM message per token (2x API calls).
// Invalid tokens are now detected directly from sendEach() error responses.

/**
 * Removes invalid tokens from all relevant collections:
 * 1. askedToBeNotified (legacy)
 * 2. pushNotifications (token metadata)
 * 3. statementsSubscribe.tokens[] (subscription tokens array)
 */
async function removeInvalidTokens(invalidTokens: FcmSubscriber[]): Promise<void> {
	if (invalidTokens.length === 0) return;

	const batch = db.batch();

	for (const subscriber of invalidTokens) {
		// Remove from askedToBeNotified collection (legacy)
		if (subscriber.documentId) {
			const docRef = db.doc(`${Collections.askedToBeNotified}/${subscriber.documentId}`);
			batch.delete(docRef);
		}

		// Remove from pushNotifications collection
		const pushNotificationRef = db.doc(`${Collections.pushNotifications}/${subscriber.token}`);
		batch.delete(pushNotificationRef);
	}

	await batch.commit();

	// Remove tokens from statementsSubscribe.tokens[] arrays
	// This requires querying subscriptions by userId and updating them
	await removeTokensFromSubscriptions(invalidTokens);

	logger.info(`Removed ${invalidTokens.length} invalid tokens from all collections`);
}

/**
 * Removes invalid tokens from statementsSubscribe.tokens[] arrays.
 * Groups tokens by userId for efficient batch updates.
 */
async function removeTokensFromSubscriptions(invalidTokens: FcmSubscriber[]): Promise<void> {
	if (invalidTokens.length === 0) return;

	// Group tokens by userId
	const tokensByUser = new Map<string, string[]>();
	for (const subscriber of invalidTokens) {
		const tokens = tokensByUser.get(subscriber.userId) || [];
		tokens.push(subscriber.token);
		tokensByUser.set(subscriber.userId, tokens);
	}

	// Process each user's subscriptions
	const updatePromises: Promise<void>[] = [];

	for (const [userId, tokens] of tokensByUser) {
		updatePromises.push(removeUserTokensFromSubscriptions(userId, tokens));
	}

	await Promise.all(updatePromises);
}

/**
 * Removes specific tokens from all of a user's statement subscriptions.
 */
async function removeUserTokensFromSubscriptions(userId: string, tokens: string[]): Promise<void> {
	try {
		// Query all subscriptions for this user that have tokens
		const subscriptionsSnapshot = await db
			.collection(Collections.statementsSubscribe)
			.where('userId', '==', userId)
			.get();

		if (subscriptionsSnapshot.empty) return;

		// Batch update to remove tokens
		const batchSize = 500;
		let batch = db.batch();
		let operationCount = 0;

		for (const docSnapshot of subscriptionsSnapshot.docs) {
			const subscription = docSnapshot.data();
			const currentTokens: string[] = subscription.tokens || [];

			// Filter out invalid tokens
			const updatedTokens = currentTokens.filter((t) => !tokens.includes(t));

			// Only update if tokens changed
			if (updatedTokens.length !== currentTokens.length) {
				batch.update(docSnapshot.ref, {
					tokens: updatedTokens,
					lastUpdate: Date.now(),
				});
				operationCount++;

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

		logger.info(`Removed ${tokens.length} invalid tokens from ${userId}'s subscriptions`);
	} catch (error) {
		logger.error(`Error removing tokens from user ${userId} subscriptions:`, error);
	}
}

/**
 * Sends FCM push notifications with improved error handling and retry logic
 */
export async function processFcmNotificationsImproved(
	fcmSubscribers: FcmSubscriber[],
	newStatement: Statement,
	parentStatement: Statement | null = null,
): Promise<SendResult> {
	const result: SendResult = {
		successful: 0,
		failed: 0,
		invalidTokens: [],
	};

	if (fcmSubscribers.length === 0) {
		return result;
	}

	// Filter out users in quiet hours
	const tokensAfterQuietHours = await filterByQuietHours(fcmSubscribers);
	const quietHoursFiltered = fcmSubscribers.length - tokensAfterQuietHours.length;

	if (quietHoursFiltered > 0) {
		logger.info(`Filtered ${quietHoursFiltered} tokens due to quiet hours`);
	}

	if (tokensAfterQuietHours.length === 0) {
		logger.info('No tokens remaining after quiet hours filter');

		return result;
	}

	// Format FCM messages — no pre-validation needed, invalid tokens are detected from send errors.
	const creatorName = newStatement.creator.displayName || 'Someone';
	const creatorPhoto = newStatement.creator.photoURL || '';
	const statementPreview =
		newStatement.statement.substring(0, 120) + (newStatement.statement.length > 120 ? '...' : '');

	let notificationTitle = `New statement from ${creatorName}`;
	let notificationBody = `"${statementPreview}"`;

	if (parentStatement?.statement) {
		const parentPreview =
			parentStatement.statement.substring(0, 40) +
			(parentStatement.statement.length > 40 ? '...' : '');
		notificationTitle = `${creatorName} replied`;
		notificationBody = `On: "${parentPreview}"\n\n"${statementPreview}"`;
	}

	const notificationUrl = `/statement/${newStatement.parentId}?focusId=${newStatement.statementId}`;
	const notificationTag = `discussion-${newStatement.parentId}`;

	const fcmMessages: admin.messaging.Message[] = tokensAfterQuietHours.map((subscriber) => ({
		token: subscriber.token,
		notification: {
			title: notificationTitle,
			body: notificationBody,
			...(creatorPhoto && { image: creatorPhoto }),
		},
		data: {
			statementId: newStatement.statementId,
			parentId: newStatement.parentId,
			createdAt: newStatement.createdAt.toString(),
			notificationType: 'statement_reply',
			url: notificationUrl,
			tag: notificationTag,
			openActionTitle: 'View Reply',
			creatorPhoto: creatorPhoto,
			creatorName: creatorName,
			requireInteraction: 'true',
		},
		webpush: {
			headers: { Urgency: 'high' },
			fcmOptions: { link: notificationUrl },
		},
		android: {
			priority: 'high' as const,
			notification: {
				channelId: 'freedi_replies',
				tag: notificationTag,
				clickAction: 'OPEN_DISCUSSION',
			},
		},
		apns: {
			headers: { 'apns-priority': '10' },
			payload: { aps: { 'mutable-content': 1, sound: 'default' } },
		},
	}));

	// Send in batches of 500 using sendEach (single API call per batch).
	// Invalid tokens are detected from send errors — no separate validation pass needed.
	const FCM_BATCH_SIZE = 500;
	for (let i = 0; i < fcmMessages.length; i += FCM_BATCH_SIZE) {
		const batch = fcmMessages.slice(i, i + FCM_BATCH_SIZE);
		const subscriberBatch = tokensAfterQuietHours.slice(i, i + FCM_BATCH_SIZE);

		try {
			const batchResponse = await admin.messaging().sendEach(batch);

			batchResponse.responses.forEach((response, index) => {
				if (response.success) {
					result.successful++;
				} else {
					result.failed++;
					const errorCode = response.error?.code;

					if (
						errorCode === 'messaging/registration-token-not-registered' ||
						errorCode === 'messaging/invalid-registration-token' ||
						errorCode === 'messaging/invalid-argument'
					) {
						result.invalidTokens.push(subscriberBatch[index].token);
					}
				}
			});

			logger.info(
				`FCM batch: ${batchResponse.successCount} sent, ${batchResponse.failureCount} failed`,
			);
		} catch (error) {
			logger.error('FCM sendEach batch failed:', error);
			result.failed += batch.length;
		}
	}

	// Clean up invalid tokens discovered during send
	if (result.invalidTokens.length > 0) {
		const tokensToRemove = tokensAfterQuietHours.filter((t) =>
			result.invalidTokens.includes(t.token),
		);
		await removeInvalidTokens(tokensToRemove);
	}

	return result;
}
