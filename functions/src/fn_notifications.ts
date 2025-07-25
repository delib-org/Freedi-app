import {
	Collections,
	NotificationType,
	QuestionType,
	Statement,
	StatementSchema,
	StatementSubscription,
} from 'delib-npm';
import { logger } from 'firebase-functions/v1';
import { parse } from 'valibot';
import { db } from './index';
import { FirestoreEvent } from 'firebase-functions/v2/firestore';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

interface FcmSubscriber {
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
		const [subscribersDB, parentStatementDB, askedToBeNotifiedDB] =
			await fetchNotificationData(statement.parentId);

		const subscribersInApp = subscribersDB.docs.map(
			(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription
		);
		const parentStatement = parse(
			StatementSchema,
			parentStatementDB.data()
		);

		// Also fetch subscribers for the top-level parent if this is a nested reply
		let topLevelSubscribers: StatementSubscription[] = [];
		if (statement.parentId !== 'top') {
			// Find the top-level parent by traversing up
			let currentParent = parentStatement;
			while (currentParent && currentParent.parentId !== 'top') {
				const parentDoc = await db
					.doc(`${Collections.statements}/${currentParent.parentId}`)
					.get();
				if (parentDoc.exists) {
					currentParent = parse(StatementSchema, parentDoc.data());
				} else {
					break;
				}
			}

			if (
				currentParent &&
				currentParent.statementId !== statement.parentId
			) {
				const topSubscribersDB = await db
					.collection(Collections.statementsSubscribe)
					.where('statementId', '==', currentParent.statementId)
					.where('getInAppNotification', '==', true)
					.get();

				topLevelSubscribers = topSubscribersDB.docs.map(
					(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription
				);
			}
		}

		// Combine subscribers
		const seenUserIds = new Set();
		const allSubscribers = [
			...subscribersInApp,
			...topLevelSubscribers,
		].filter((subscriber) => {
			if (seenUserIds.has(subscriber.user.uid)) {
				return false;
			}
			seenUserIds.add(subscriber.user.uid);

			return true;
		});

		//get fcm subscribers
		const fcmSubscribers: FcmSubscriber[] = askedToBeNotifiedDB.docs.map(
			(ntfDB: QueryDocumentSnapshot) => {
				const data = ntfDB.data();

				return {
					userId: data.userId,
					token: data.token,
					documentId: ntfDB.id,
				};
			}
		);

		logger.info(`Found ${fcmSubscribers.length} FCM subscribers for statement ${statement.parentId}`);

		//update last message in the parent statement
		await db.doc(`${Collections.statements}/${statement.parentId}`).update({
			lastMessage: {
				message: newStatement.statement,
				creator: newStatement.creator.displayName || 'Anonymous',
				createdAt: newStatement.createdAt,
			},
		});

		// Process notifications
		await processInAppNotifications(
			allSubscribers,
			newStatement,
			parentStatement
		);
		
		// Process FCM notifications with improved error handling
		const sendResult = await processFcmNotificationsImproved(
			fcmSubscribers, 
			newStatement
		);
		
		logger.info('FCM notification send result:', sendResult);
	} catch (error) {
		logger.error('Error in updateInAppNotifications:', error);
	}
}

/**
 * Fetches all data needed for notification processing in parallel.
 */
async function fetchNotificationData(parentId: string) {
	// Query for in-app and FCM notification subscribers
	const parentStatementSubscribersCB = db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', parentId)
		.where('getInAppNotification', '==', true)
		.get();
	const askedToBeNotifiedCB = db
		.collection(Collections.askedToBeNotified)
		.where('statementId', '==', parentId)
		.get();
	const parentStatementCB = db
		.doc(`${Collections.statements}/${parentId}`)
		.get();

	return await Promise.all([
		parentStatementSubscribersCB,
		parentStatementCB,
		askedToBeNotifiedCB,
	]);
}

/**
 * Creates in-app notifications using batch write operation.
 */
async function processInAppNotifications(
	subscribersInApp: StatementSubscription[],
	newStatement: Statement,
	parentStatement: Statement
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
			QuestionType.multiStage;

		const newNotification: NotificationType = {
			userId: subscriber.user.uid,
			parentId: newStatement.parentId,
			parentStatement: parentStatement.statement,
			statementType: newStatement.statementType,
			questionType: questionType,
			text: newStatement.statement,
			creatorId: newStatement.creator.uid,
			creatorName: newStatement.creator.displayName,
			creatorImage: newStatement.creator.photoURL,
			createdAt: newStatement.createdAt,
			read: false,
			notificationId: notificationRef.id,
			statementId: newStatement.statementId,
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
 * Removes invalid tokens from the database
 */
async function removeInvalidTokens(invalidTokens: FcmSubscriber[]): Promise<void> {
	if (invalidTokens.length === 0) return;

	const batch = db.batch();
	
	for (const subscriber of invalidTokens) {
		// Remove from askedToBeNotified collection
		if (subscriber.documentId) {
			const docRef = db.doc(`${Collections.askedToBeNotified}/${subscriber.documentId}`);
			batch.delete(docRef);
		}
		
		// Also remove from pushNotifications collection
		const pushNotificationRef = db.doc(`pushNotifications/${subscriber.token}`);
		batch.delete(pushNotificationRef);
	}

	await batch.commit();
	logger.info(`Removed ${invalidTokens.length} invalid tokens`);
}

/**
 * Sends FCM push notifications with improved error handling and retry logic
 */
async function processFcmNotificationsImproved(
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

	// Format FCM messages for valid tokens only
	const fcmMessages = validTokens.map((subscriber) => ({
		token: subscriber.token,
		notification: {
			title: `New reply from ${newStatement.creator.displayName}`,
			body:
				newStatement.statement.substring(0, 100) +
				(newStatement.statement.length > 100 ? '...' : ''),
		},
		data: {
			statementId: newStatement.statementId,
			parentId: newStatement.parentId,
			createdAt: newStatement.createdAt.toString(),
			notificationType: 'statement_reply',
		},
	}));

	// Send notifications in batches with retry logic
	const fcmBatchSize = 500;
	for (let i = 0; i < fcmMessages.length; i += fcmBatchSize) {
		const batch = fcmMessages.slice(i, i + fcmBatchSize);
		const batchResult = await sendBatchWithRetry(batch, validTokens.slice(i, i + fcmBatchSize));
		
		result.successful += batchResult.successful;
		result.failed += batchResult.failed;
		result.invalidTokens.push(...batchResult.invalidTokens);
	}

	// Clean up any newly discovered invalid tokens
	if (result.invalidTokens.length > 0) {
		const tokensToRemove = validTokens.filter(t => result.invalidTokens.includes(t.token));
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