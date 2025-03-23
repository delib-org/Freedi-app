import { Change, logger } from 'firebase-functions';
import { addOrRemoveMemberFromStatementDB } from './fn_statementsMetaData';
import { Collections, Role, Statement, StatementSchema, StatementSubscription, StatementSubscriptionSchema, createSubscription, getStatementSubscriptionId, isMember, statementToSimpleStatement } from 'delib-npm';
import { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';
import { db } from '.';

export async function updateStatementNumberOfMembers(
	event: FirestoreEvent<
		Change<DocumentSnapshot> | undefined,
		{
			subscriptionId: string;
		}
	>
) {
	if (!event.data) return;
	try {

		const statementsSubscribeBefore = !event.data.before.exists ? undefined : parse(
			StatementSubscriptionSchema,
			event.data.before.data()
		);

		const statementsSubscribeAfter = parse(
			StatementSubscriptionSchema,
			event.data.after.data()
		);

		const roleBefore = statementsSubscribeBefore
			? statementsSubscribeBefore.role
			: undefined;
		const roleAfter = statementsSubscribeAfter
			? statementsSubscribeAfter.role
			: undefined;

		const eventType = getEventType(event);
		if (eventType === 'update' && roleBefore === roleAfter) return;

		const _isMemberAfter = isMember(roleAfter);
		const _isMemberBefore = isMember(roleBefore);
		const statementId: string =
			statementsSubscribeBefore?.statementId ||
			statementsSubscribeAfter?.statementId;

		await addOrRemoveMemberFromStatementDB(
			statementId,
			eventType,
			_isMemberAfter,
			_isMemberBefore
		);

		//inner functions
		function getEventType(
			event: FirestoreEvent<
				Change<DocumentSnapshot> | undefined,
				{
					subscriptionId: string;
				}
			>
		): 'new' | 'update' | 'delete' {
			if (!event.data) return 'delete';

			const beforeSnapshot = event.data.before;
			const afterSnapshot = event.data.after;

			if (!beforeSnapshot.exists) {
				return 'new';
			} else if (!afterSnapshot.exists) {
				return 'delete';
			} else {
				return 'update';
			}
		}
	} catch (error) {
		logger.error('error updating statement with number of members', error);
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