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

interface TokenValidationResult {
	validTokens: FcmSubscriber[];
	invalidTokens: FcmSubscriber[];
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
	const userIds = [...new Set(subscribers.map(s => s.userId))];
	const quietHoursMap = new Map<string, QuietHoursConfig | null>();

	// Batch fetch quiet hours for all users (using tokens)
	const fetchPromises = userIds.map(async (userId) => {
		try {
			const tokensSnapshot = await db
				.collection('pushNotifications')
				.where('userId', '==', userId)
				.limit(1)
				.get();

			if (!tokensSnapshot.empty) {
				const tokenData = tokensSnapshot.docs[0].data();
				quietHoursMap.set(userId, tokenData.quietHours as QuietHoursConfig | undefined || null);
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
	return subscribers.filter(subscriber => {
		const quietHours = quietHoursMap.get(subscriber.userId);

		return !isInQuietHours(quietHours || undefined);
	});
}

/**
 * Updates in-app notifications when a new statement is created as a reply.
 * Creates notifications for users subscribed to the parent statement.
 */
export async function updateInAppNotifications(
	e: FirestoreEvent<QueryDocumentSnapshot>
): Promise<void> {
	try {
		//go to the new statement and parse it
		const newStatement = e.data?.data() as Statement;
		const statement = parse(StatementSchema, newStatement);

		// Fetch all required data in parallel
		const [subscribersDB, parentStatementDB, pushSubscribersDB] =
			await fetchNotificationData(statement.parentId);

		const subscribersInApp = subscribersDB.docs.map(
			(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription
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
			parentStatement = parse(
				StatementSchema,
				parentStatementDB.data()
			);
		}

		// Also fetch subscribers for ALL parent statements in the hierarchy
		let allParentSubscribers: StatementSubscription[] = [];
		if (statement.parentId !== 'top' && statement.parents && statement.parents.length > 0) {
			// Get all parent statement IDs from the parents array
			const parentIds = statement.parents.filter(id => id !== 'top');
			
			// Fetch subscribers for all parent statements in parallel
			const parentSubscriberPromises = parentIds.map(async (parentId) => {
				const subscribersDB = await db
					.collection(Collections.statementsSubscribe)
					.where('statementId', '==', parentId)
					.where('getInAppNotification', '==', true)
					.get();
				
				return subscribersDB.docs.map(
					(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription
				);
			});
			
			// Wait for all parent subscriber queries to complete
			const parentSubscriberArrays = await Promise.all(parentSubscriberPromises);
			
			// Flatten the array of arrays into a single array
			allParentSubscribers = parentSubscriberArrays.flat();
			
			logger.info(`Found ${allParentSubscribers.length} subscribers from ${parentIds.length} parent statements`);
		}

		// Combine subscribers from direct parent and all ancestors
		const seenUserIds = new Set();
		const allSubscribers = [
			...subscribersInApp,
			...allParentSubscribers,
		].filter((subscriber) => {
			if (seenUserIds.has(subscriber.user.uid)) {
				return false;
			}
			seenUserIds.add(subscriber.user.uid);

			return true;
		});

		// Get push notification subscribers
		const pushSubscribers = pushSubscribersDB.docs.map(
			(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription
		);
		
		// Also get push subscribers from all parent statements
		let allPushSubscribers = [...pushSubscribers];
		if (statement.parentId !== 'top' && allParentSubscribers.length > 0) {
			const parentPushSubscribers = allParentSubscribers.filter(
				sub => sub.getPushNotification === true
			);
			// Combine and dedupe by userId
			const seenPushUserIds = new Set(pushSubscribers.map(s => s.userId));
			parentPushSubscribers.forEach(sub => {
				if (!seenPushUserIds.has(sub.userId)) {
					allPushSubscribers.push(sub);
				}
			});
		}

		// Convert to FCM subscriber format
		const fcmSubscribers: FcmSubscriber[] = [];
		allPushSubscribers.forEach(subscriber => {
			if (subscriber.tokens && subscriber.tokens.length > 0) {
				subscriber.tokens.forEach(token => {
					fcmSubscribers.push({
						userId: subscriber.userId,
						token: token,
						documentId: `${subscriber.userId}_${statement.parentId}`
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
		await processInAppNotifications(
			allSubscribers,
			newStatement,
			parentStatement
		);
		
		// Process FCM notifications with improved error handling
		await processFcmNotificationsImproved(
			fcmSubscribers,
			newStatement
		);
	} catch (error) {
		logger.error('Error in updateInAppNotifications:', error);
	}
}

/**
 * Fetches all data needed for notification processing in parallel.
 */
async function fetchNotificationData(parentId: string) {
	// Query for in-app notification subscribers
	const parentStatementSubscribersCB = db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', parentId)
		.where('getInAppNotification', '==', true)
		.get();
	
	// Query for push notification subscribers
	const pushStatementSubscribersCB = db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', parentId)
		.where('getPushNotification', '==', true)
		.get();
		
	const parentStatementCB = db
		.doc(`${Collections.statements}/${parentId}`)
		.get();

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
	parentStatement: Statement | null
) {
	//here we should have all the subscribers for the parent notification

	const batch = db.batch();

	// Create notification for each subscriber
	subscribersInApp.forEach((subscriber: StatementSubscription) => {
		const notificationRef = db
			.collection(Collections.inAppNotifications)
			.doc();

		const questionType =
			newStatement.questionSettings?.questionType ??
			getDefaultQuestionType();

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
			read: false, // ✅ Set as unread by default
			notificationId: notificationRef.id,
			statementId: newStatement.statementId,
			// ✅ New optional fields for tracking
			viewedInList: false,
			viewedInContext: false,
			// readAt will be set when notification is marked as read
		};
		batch.create(notificationRef, newNotification);
	});

	await batch.commit();
}

/**
 * Validates FCM tokens - only marks tokens as invalid if they have specific invalid token errors
 */
async function validateTokens(subscribers: FcmSubscriber[]): Promise<TokenValidationResult> {
	const validTokens: FcmSubscriber[] = [];
	const invalidTokens: FcmSubscriber[] = [];

	// Create validation promises for all tokens
	const validationPromises = subscribers.map(async (subscriber) => {
		try {
			// Send a dry run message to validate the token
			await admin.messaging().send({
				token: subscriber.token,
				notification: {
					title: 'Test',
					body: 'Test'
				},
				data: {
					test: 'true'
				}
			}, true); // true = dry run
			
			validTokens.push(subscriber);
		} catch (error) {
			const errorCode = error instanceof Error && 'code' in error ? (error as { code: string }).code : 'unknown';
			
			// Only mark as invalid if it's a specific token error
			if (errorCode === 'messaging/registration-token-not-registered' ||
				errorCode === 'messaging/invalid-registration-token' ||
				errorCode === 'messaging/invalid-argument') {
				logger.warn(`Invalid token for user ${subscriber.userId}:`, errorCode);
				invalidTokens.push(subscriber);
			} else {
				// For other errors (like quota, server errors, etc), consider the token valid
				logger.info(`Token validation warning for user ${subscriber.userId}: ${errorCode}, treating as valid`);
				validTokens.push(subscriber);
			}
		}
	});

	// Wait for all validations to complete
	await Promise.all(validationPromises);

	logger.info(`Token validation complete: ${validTokens.length} valid, ${invalidTokens.length} invalid`);

	return { validTokens, invalidTokens };
}

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
		const pushNotificationRef = db.doc(`pushNotifications/${subscriber.token}`);
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
			const updatedTokens = currentTokens.filter(t => !tokens.includes(t));

			// Only update if tokens changed
			if (updatedTokens.length !== currentTokens.length) {
				batch.update(docSnapshot.ref, {
					tokens: updatedTokens,
					lastUpdate: Date.now()
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
	newStatement: Statement
): Promise<SendResult> {
	const result: SendResult = {
		successful: 0,
		failed: 0,
		invalidTokens: []
	};

	if (fcmSubscribers.length === 0) {
		return result;
	}

	// First, validate all tokens (skip validation if in development to speed up)
	const skipValidation = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'development';
	
	let validTokens = fcmSubscribers;
	let invalidTokens: FcmSubscriber[] = [];
	
	if (!skipValidation) {
		logger.info(`Validating ${fcmSubscribers.length} FCM tokens...`);
		const validationResult = await validateTokens(fcmSubscribers);
		validTokens = validationResult.validTokens;
		invalidTokens = validationResult.invalidTokens;
	} else {
		logger.info(`Skipping token validation (development mode) for ${fcmSubscribers.length} tokens`);
	}
	
	// Remove invalid tokens from database
	if (invalidTokens.length > 0) {
		await removeInvalidTokens(invalidTokens);
		result.invalidTokens = invalidTokens.map(t => t.token);
	}

	if (validTokens.length === 0) {
		logger.warn('No valid tokens found after validation');

return result;
	}

	// Filter out users in quiet hours
	const tokensAfterQuietHours = await filterByQuietHours(validTokens);
	const quietHoursFiltered = validTokens.length - tokensAfterQuietHours.length;

	if (quietHoursFiltered > 0) {
		logger.info(`Filtered ${quietHoursFiltered} tokens due to quiet hours`);
	}

	if (tokensAfterQuietHours.length === 0) {
		logger.info('No tokens remaining after quiet hours filter');

		return result;
	}

	// Format FCM messages for valid tokens only with rich notification features
	const creatorName = newStatement.creator.displayName || 'Someone';
	const creatorPhoto = newStatement.creator.photoURL || '';
	const statementPreview = newStatement.statement.substring(0, 100) +
		(newStatement.statement.length > 100 ? '...' : '');

	// Build URL for notification click
	const notificationUrl = `/statement/${newStatement.parentId}?focusId=${newStatement.statementId}`;

	// Tag for grouping notifications from same discussion
	const notificationTag = `discussion-${newStatement.parentId}`;

	const fcmMessages = tokensAfterQuietHours.map((subscriber) => ({
		token: subscriber.token,
		notification: {
			title: `New reply from ${creatorName}`,
			body: statementPreview,
			// Include creator's photo as notification image
			...(creatorPhoto && { image: creatorPhoto }),
		},
		data: {
			statementId: newStatement.statementId,
			parentId: newStatement.parentId,
			createdAt: newStatement.createdAt.toString(),
			notificationType: 'statement_reply',
			// Rich notification data
			url: notificationUrl,
			tag: notificationTag,
			openActionTitle: 'View Reply',
			creatorPhoto: creatorPhoto,
			creatorName: creatorName,
			// Require interaction so user sees it
			requireInteraction: 'true',
		},
		// Web push specific options
		webpush: {
			headers: {
				Urgency: 'high',
			},
			fcmOptions: {
				link: notificationUrl,
			},
		},
		// Android specific options
		android: {
			priority: 'high' as const,
			notification: {
				channelId: 'freedi_replies',
				tag: notificationTag,
				clickAction: 'OPEN_DISCUSSION',
			},
		},
		// APNs specific options for iOS
		apns: {
			headers: {
				'apns-priority': '10',
			},
			payload: {
				aps: {
					'mutable-content': 1,
					sound: 'default',
				},
			},
		},
	}));

	// Send notifications in batches with retry logic
	const fcmBatchSize = 500;
	for (let i = 0; i < fcmMessages.length; i += fcmBatchSize) {
		const batch = fcmMessages.slice(i, i + fcmBatchSize);
		const batchResult = await sendBatchWithRetry(batch, tokensAfterQuietHours.slice(i, i + fcmBatchSize));

		result.successful += batchResult.successful;
		result.failed += batchResult.failed;
		result.invalidTokens.push(...batchResult.invalidTokens);
	}

	// Clean up any newly discovered invalid tokens
	if (result.invalidTokens.length > 0) {
		const tokensToRemove = tokensAfterQuietHours.filter(t => result.invalidTokens.includes(t.token));
		await removeInvalidTokens(tokensToRemove);
	}

	return result;
}

/**
 * Sends a batch of messages with retry logic and exponential backoff
 */
async function sendBatchWithRetry(
	messages: admin.messaging.Message[], 
	subscribers: FcmSubscriber[],
	maxRetries: number = 3
): Promise<SendResult> {
	const result: SendResult = {
		successful: 0,
		failed: 0,
		invalidTokens: []
	};

	let retryMessages = [...messages];
	let retrySubscribers = [...subscribers];
	let attempt = 0;

	while (retryMessages.length > 0 && attempt < maxRetries) {
		const failedMessages: admin.messaging.Message[] = [];
		const failedSubscribers: FcmSubscriber[] = [];

		// Send messages individually instead of using sendAll
		// Add a small delay between messages to avoid rate limiting
		for (let i = 0; i < retryMessages.length; i++) {
			const message = retryMessages[i] as admin.messaging.TokenMessage;
			try {
				logger.info(`Sending notification to token: ${message.token.substring(0, 20)}...`);
				const messageId = await admin.messaging().send(retryMessages[i]);
				result.successful++;
				logger.info(`Successfully sent notification. Message ID: ${messageId}`);
				
				// Add 50ms delay between messages to avoid rate limiting
				if (i < retryMessages.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 50));
				}
			} catch (error: unknown) {
				logger.error(`Failed to send to token ${message.token}:`, error);

				// Type guard for Firebase errors
				const isFirebaseError = (err: unknown): err is { code?: string } => {
					return typeof err === 'object' && err !== null && 'code' in err;
				};

				if (isFirebaseError(error)) {
					// Check if token is invalid
					if (error.code === 'messaging/registration-token-not-registered' ||
						error.code === 'messaging/invalid-registration-token' ||
						error.code === 'messaging/invalid-argument') {
						result.invalidTokens.push(message.token);
					} else if (error.code === 'messaging/message-rate-exceeded' ||
							   error.code === 'messaging/internal-error' ||
							   error.code === 'messaging/server-unavailable' ||
							   error.code === 'messaging/unknown-error') {
						// These errors might be temporary, retry them
						failedMessages.push(retryMessages[i]);
						failedSubscribers.push(retrySubscribers[i]);
					} else {
						// Other errors, don't retry
						result.failed++;
					}
				} else {
					// Unknown error type, retry it
					failedMessages.push(retryMessages[i]);
					failedSubscribers.push(retrySubscribers[i]);
				}
			}
		}

		// Prepare for next retry attempt
		retryMessages = failedMessages;
		retrySubscribers = failedSubscribers;

			if (retryMessages.length > 0 && attempt < maxRetries - 1) {
				// Exponential backoff: 1s, 2s, 4s
				const delay = Math.pow(2, attempt) * 1000;
				logger.info(`Retrying ${retryMessages.length} failed messages after ${delay}ms delay...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}

		attempt++;
	}

	// Any remaining messages after all retries are considered failed
	result.failed += retryMessages.length;

	return result;
}
