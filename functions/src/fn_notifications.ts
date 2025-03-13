import { Collections, NotificationType, Statement, StatementSchema, StatementSubscription } from "delib-npm";
import { logger } from "firebase-functions/v1";
import { parse } from "valibot";
import { db } from ".";
import { FirestoreEvent } from "firebase-functions/firestore";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import * as admin from "firebase-admin";

export async function updateInAppNotifications(
	e: FirestoreEvent<QueryDocumentSnapshot>,
	context: { statementId: string }
): Promise<void> {
	try {
		const newStatement = e.data?.data() as Statement;

		if (newStatement.parentId === 'top') return;
		const statement = parse(StatementSchema, newStatement);

		// Find all users that have the parent statement in their subscriptions
		const parentStatementSubscribersCB = db.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statement.parentId)
			.where("getInAppNotification", "==", true)
			.get();

		// Get users who asked to be notified via FCM
		const askedToBeNotifiedCB = db.collection(Collections.askedToBeNotified)
			.where('statementId', '==', statement.parentId)
			.get();

		const parentStatementCB = db.doc(`${Collections.statements}/${statement.parentId}`).get();

		const [subscribersDB, parentStatementDB, askedToBeNotifiedDB] = await Promise.all([
			parentStatementSubscribersCB,
			parentStatementCB,
			askedToBeNotifiedCB
		]);

		const subscribersInApp = subscribersDB.docs.map((doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription);
		const parentStatement = parse(StatementSchema, parentStatementDB.data());

		// Get FCM subscribers
		const fcmSubscribers = askedToBeNotifiedDB.docs.map((doc: QueryDocumentSnapshot) => doc.data());

		// Create batch for in-app notifications
		const batch = db.batch();

		// Process in-app notifications
		subscribersInApp.forEach((subscriber: StatementSubscription) => {
			const notificationRef = db.collection(Collections.inAppNotifications).doc();
			const newNotification: NotificationType = {
				userId: subscriber.userId,
				parentId: newStatement.parentId,
				parentStatement: parentStatement.statement,
				text: newStatement.statement,
				creatorName: newStatement.creator.displayName,
				creatorImage: newStatement.creator.photoURL,
				createdAt: newStatement.createdAt,
				read: false,
				notificationId: notificationRef.id,
				statementId: newStatement.statementId,
			};
			batch.create(notificationRef, newNotification);
		});

		// Commit the batch for in-app notifications
		await batch.commit();

		// Process FCM notifications
		// Process FCM notifications
		if (fcmSubscribers.length > 0) {
			// Prepare FCM messages
			const fcmMessages = [];

			for (const subscriber of fcmSubscribers) {
				if (subscriber.userId && subscriber.token) {
					const message = {
						token: subscriber.token,
						notification: {
							title: `New reply from ${newStatement.creator.displayName}`,
							body: newStatement.statement.substring(0, 100) + (newStatement.statement.length > 100 ? '...' : '')
						},
						data: {
							statementId: newStatement.statementId,
							parentId: newStatement.parentId,
							createdAt: newStatement.createdAt.toString(),
							notificationType: 'statement_reply'
						}
					};

					fcmMessages.push(message);
				}
			}

			// Send FCM notifications one by one or in parallel
			const fcmBatchSize = 500;
			for (let i = 0; i < fcmMessages.length; i += fcmBatchSize) {
				const batch = fcmMessages.slice(i, i + fcmBatchSize);
				if (batch.length > 0) {
					try {
						// Use Promise.all with individual send calls instead of sendAll
						await Promise.all(
							batch.map(message => admin.messaging().send(message))
						);
					} catch (fcmError) {
						logger.error("Error sending FCM notifications:", fcmError);
					}
				}
			}
		}

		return;
	} catch (error) {
		logger.error(error);

		return;
	}
}