import { Change, logger } from 'firebase-functions';
import { addOrRemoveMemberFromStatementDB } from './fn_statementsMetaData';
import { Collections, Statement, StatementSchema, StatementSubscription, StatementSubscriptionSchema, isMember, statementToSimpleStatement } from 'delib-npm';
import { DocumentSnapshot } from 'firebase-admin/firestore';
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

export async function updateMembersWithSimpleStatement(event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { subscriptionId: string; }>) {
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

		//convert to simple statement
		const simpleStatement = simpleStatementAfter;

		//update all statement subscriptions
		if (statementSubscriptions.length === 0) throw new Error('no subscriptions found');

		const batch = db.batch();
		statementSubscriptions.forEach((subscription) => {
			const subscriptionRef = db.collection(Collections.statementsSubscribe).doc(subscription.statementsSubscribeId);
			batch.update(subscriptionRef, { statement: simpleStatement });
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
