import { Change, logger } from 'firebase-functions';
import { Collections, Role, Statement, StatementSchema, StatementSubscription, StatementSubscriptionSchema, createSubscription, getRandomUID, getStatementSubscriptionId, statementToSimpleStatement } from 'delib-npm';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';
import { db } from '.';
import { QueryDocumentSnapshot } from 'firebase-functions/v1/firestore';

export async function onNewSubscription(event: any) {
	try {
		const snapshot = event.data as DocumentSnapshot | undefined;
		if (!snapshot) throw new Error('No snapshot found in onNewSubscription');

		const subscription = parse(StatementSubscriptionSchema, snapshot.data()) as StatementSubscription;

		console.log("subscription:", subscription)

		//if new subscription role is waiting, then update the collection waitingForApproval
		const role = subscription.role;
		const subscriptionId = subscription.statementsSubscribeId;
		if (!subscriptionId) throw new Error('No subscriptionId found');
		if (role === Role.waiting) {

			//get all admins of the top parent statement
			const statement = parse(StatementSchema, subscription.statement);
			const topParentId = statement.parentId === 'top' ? statement.statementId : statement.topParentId;

			const adminsDB = await db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', topParentId)
				.where('role', '==', Role.admin)
				.get();
			if (adminsDB.empty) throw new Error('No admins found');
			if (adminsDB.docs.length === 0) throw new Error('No admins found');

			const adminsSubscriptions = adminsDB.docs.map((doc) =>
				parse(StatementSubscriptionSchema, doc.data())
			) as StatementSubscription[];

			// Update the collection awaitingUsers for each admin
			const batch = db.batch();

			const collectionRef = db.collection(Collections.awaitingUsers);

			adminsSubscriptions.forEach((adminSub: StatementSubscription) => {

				const adminRef = collectionRef.doc(getRandomUID());
				const adminCall = {
					...subscription,
					adminId: adminSub.userId
				}
				batch.set(adminRef, adminCall);
			});
			await batch.commit();

		}

	} catch (error) {
		logger.error('Error onNewSubscription', error);

		return;
	}
}

export async function updateSubscriptionsSimpleStatement(event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { subscriptionId: string; }>) {
	if (!event.data) return;
	try {

		const _statementBefore = event.data.before.data() as Statement | undefined;
		const _statementAfter = event.data.after.data() as Statement | undefined;
		if (!_statementBefore || !_statementAfter) return;

		const simpleStatementBefore = statementToSimpleStatement(_statementBefore);
		const simpleStatementAfter = statementToSimpleStatement(_statementAfter);

		//check if changes in the areas of simpleStatement where changed
		if (JSON.stringify(simpleStatementBefore) === JSON.stringify(simpleStatementAfter)) return;

		const statement = parse(StatementSchema, _statementAfter);

		const statementId: string = statement.statementId;

		//get all statement subscriptions
		const statementSubscriptions = await getStatementSubscriptions(statementId);

		//update all statement subscriptions
		if (statementSubscriptions.length === 0) throw new Error('no subscriptions found');

		const batch = db.batch();
		statementSubscriptions.forEach((subscription) => {
			const subscriptionRef = db.collection(Collections.statementsSubscribe).doc(subscription.statementsSubscribeId);
			batch.update(subscriptionRef, { statement: statement });
		});
		await batch.commit();

	} catch (error) {
		logger.error('Error updating updateMembersWithSimpleStatement', error);
	}
}

export async function getStatementSubscriptions(statementId: string): Promise<StatementSubscription[]> {
	const statementSubscriptions = await db.collection(Collections.statementsSubscribe)
		.where('statementId', '==', statementId)
		.get();

	return statementSubscriptions.docs.map(doc => doc.data() as StatementSubscription);
}

export async function setAdminsToNewStatement(
	ev: FirestoreEvent<
		QueryDocumentSnapshot | undefined,
		{
			statementId: string;
		}
	>
) {
	//Caution: This function grants administrative privileges to statement creators throughout the entire statement hierarchy. This approach has potential drawbacks:

	//Administrative Overhead: Exponentially increasing admin counts can strain database resources.
	//Security Concerns: Grants broad access privileges to potentially non-top-level admins.

	//Recommendations:
	//Re-evaluate Authorization Model: Consider a more fine-grained permission system that prevents excessive admin proliferation.
	//Future Enhancement: Implement a more scalable and secure solution for managing administrative rights.
	// Tal Yaron, Deliberation Team, 3rd May 2024

	if (!ev.data) return;

	try {
		//get parent statement ID
		const statement = parse(StatementSchema, ev.data.data());

		//subscribe the creator to the new statement
		const subscription = createSubscription({
			statement,
			role: Role.admin,
			user: statement.creator,
			getEmailNotification: true,
			getInAppNotification: true,
			getPushNotification: true,
		})

		if (!subscription) throw new Error('No subscription');
		if (!subscription.statementsSubscribeId) throw new Error('No subscriptionId');

		await db
			.collection(Collections.statementsSubscribe)
			.doc(subscription.statementsSubscribeId)
			.set(subscription);

		const { parentId } = statement;

		//get all admins of the parent statement
		const adminsDB = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', parentId)
			.where('role', '==', Role.admin)
			.get();
		const adminsSubscriptions = adminsDB.docs.map((doc) =>
			parse(StatementSubscriptionSchema, doc.data())
		);

		//subscribe the admins to the new statement
		adminsSubscriptions.forEach(async (adminSub: StatementSubscription) => {
			try {
				const statementsSubscribeId = getStatementSubscriptionId(
					statement.statementId,
					adminSub.user
				);
				if (!statementsSubscribeId)
					throw new Error('No statementsSubscribeId');

				const newSubscription: StatementSubscription | undefined = createSubscription({
					statement,
					role: Role.admin,
					user: adminSub.user,
					getEmailNotification: true,
					getInAppNotification: true,
					getPushNotification: true,
				});
				if (!newSubscription) throw new Error(`No newSubscription for admin ${adminSub.user.uid}`);

				parse(StatementSubscriptionSchema, newSubscription);

				await db
					.collection(Collections.statementsSubscribe)
					.doc(statementsSubscribeId)
					.set(newSubscription);
			} catch (error) {
				logger.error(
					'In setAdminsToNewStatement, on subscribe the admins to the new statement'
				);
				logger.error(error);
			}
		});
	} catch (error) {
		logger.error(error);
	}
}