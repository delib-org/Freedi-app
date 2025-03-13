import { Collections, getStatementSubscriptionId, NotificationType, Statement, StatementSchema, StatementSubscription } from "delib-npm";
import { logger } from "firebase-functions/v1";
import { parse } from "valibot";
import { db } from ".";
import { FirestoreEvent } from "firebase-functions/firestore";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

export async function updateInAppNotifications(e: FirestoreEvent<
	QueryDocumentSnapshot | undefined,
	{
		statementId: string;
	}
>) {
	try {

		const newStatement = e.data?.data() as Statement;
		console.log("new statemetnt", newStatement.statement);

		if (newStatement.parentId === 'top') return;

		const statement = parse(StatementSchema, newStatement);

		//find all users that have the parent statement in their subscriptions
		const parentStatementSubscribersCB = db.collection(Collections.statementsSubscribe).where('statementId', '==', statement.parentId).where("getInAppNotification", "==", true).get();
		const parentStatementCB = db.doc(`${Collections.statements}/${statement.parentId}`).get();
		const [subscribersDB, parentStatementDB] = await Promise.all([parentStatementSubscribersCB, parentStatementCB]);

		const subscribersInApp = subscribersDB.docs.map((doc: QueryDocumentSnapshot) => doc.data() as StatementSubscription);
		const parentStatement = parse(StatementSchema, parentStatementDB.data());
		//update the inAppNotifications of the subscribers
		console.log("found subscribers for", parentStatement.statement, subscribersInApp.length);
		const batch = db.batch();
		subscribersInApp.forEach((subscriber: StatementSubscription) => {
			const notificationId = getStatementSubscriptionId(newStatement.parentId, subscriber.user);
			if (!notificationId) return;
			const subscriberRef = db.doc(`${Collections.inAppNotifications}/${notificationId}`);
			const newNotification: NotificationType = {
				userId: subscriber.userId,
				parentId: newStatement.parentId,
				parentStatement: parentStatement.statement,
				text: newStatement.statement,
				creatorName: newStatement.creator.displayName,
				creatorImage: newStatement.creator.photoURL,
				createdAt: newStatement.createdAt,
				read: false,
				notificationId
			};
			batch.set(subscriberRef, newNotification);
		});

		batch.commit();

	} catch (error) {
		logger.error(error);

		return;

	}
}