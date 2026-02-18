import {
	Collections,
	NotificationType,
	Statement,
	StatementSchema,
	StatementSubscription,
} from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { parse } from 'valibot';
import { db } from '.';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { getDefaultQuestionType } from './model/questionTypeDefaults';

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

		// Fetch all required data in parallel
		const [subscribersDB, parentStatementDB, askedToBeNotifiedDB] = await fetchNotificationData(
			statement.parentId,
		);

		const subscribersInApp = subscribersDB.docs.map(
			(doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription,
		);
		const parentStatement = parse(StatementSchema, parentStatementDB.data());

		// Also fetch subscribers for the top-level parent if this is a nested reply
		let topLevelSubscribers: StatementSubscription[] = [];
		if (statement.parentId !== 'top') {
			// Find the top-level parent by traversing up
			let currentParent = parentStatement;
			while (currentParent && currentParent.parentId !== 'top') {
				const parentDoc = await db.doc(`${Collections.statements}/${currentParent.parentId}`).get();
				if (parentDoc.exists) {
					currentParent = parse(StatementSchema, parentDoc.data());
				} else {
					break;
				}
			}

			if (currentParent && currentParent.statementId !== statement.parentId) {
				const topSubscribersDB = await db
					.collection(Collections.statementsSubscribe)
					.where('statementId', '==', currentParent.statementId)
					.where('getInAppNotification', '==', true)
					.get();

				topLevelSubscribers = topSubscribersDB.docs.map(
					(doc) => doc.data() as StatementSubscription,
				);
			}
		}

		// Combine subscribers
		const seenUserIds = new Set();
		const allSubscribers = [...subscribersInApp, ...topLevelSubscribers].filter((subscriber) => {
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
				};
			},
		);

		//update last message in the parent statement
		await db.doc(`${Collections.statements}/${statement.parentId}`).update({
			lastMessage: {
				message: newStatement.statement,
				creator: newStatement.creator.displayName || 'Anonymous',
				createdAt: newStatement.createdAt,
			},
		});

		// Process notifications
		await processInAppNotifications(allSubscribers, newStatement, parentStatement);
		await processFcmNotifications(fcmSubscribers, newStatement);
	} catch (error) {
		logger.error(error);
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
	const parentStatementCB = db.doc(`${Collections.statements}/${parentId}`).get();

	return await Promise.all([parentStatementSubscribersCB, parentStatementCB, askedToBeNotifiedCB]);
}

/**
 * Creates in-app notifications using batch write operation.
 */
async function processInAppNotifications(
	subscribersInApp: StatementSubscription[],
	newStatement: Statement,
	parentStatement: Statement,
) {
	//here we should have all the subscribers for the parent notification

	const batch = db.batch();

	// Create notification for each subscriber
	subscribersInApp.forEach((subscriber: StatementSubscription) => {
		const notificationRef = db.collection(Collections.inAppNotifications).doc();

		const questionType = newStatement.questionSettings?.questionType ?? getDefaultQuestionType();

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
 * Sends FCM push notifications in batches.
 */
interface FcmSubscriber {
	userId: string;
	token: string;
}

async function processFcmNotifications(fcmSubscribers: FcmSubscriber[], newStatement: Statement) {
	if (fcmSubscribers.length > 0) {
		// Format FCM messages
		const fcmMessages = fcmSubscribers
			.map((subscriber) => {
				if (subscriber.userId && subscriber.token) {
					return {
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
					};
				} else {
					return null;
				}
			})
			.filter((message) => message !== null);

		// Send notifications in batches to avoid FCM limitations
		const fcmBatchSize = 500;
		for (let i = 0; i < fcmMessages.length; i += fcmBatchSize) {
			const batch = fcmMessages.slice(i, i + fcmBatchSize);
			if (batch.length > 0) {
				try {
					await Promise.all(batch.map((message) => admin.messaging().send(message)));
				} catch (fcmError) {
					logger.error('Error sending FCM notifications:', fcmError);
				}
			}
		}
	}
}
