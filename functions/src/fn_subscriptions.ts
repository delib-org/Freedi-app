import { Change, logger } from 'firebase-functions';
import { addOrRemoveMemberFromStatementDB } from './fn_statementsMetaData';
import { StatementSubscriptionSchema } from '../../src/types/statement/StatementSubscription';
import { isMember } from '../../src/types/TypeUtils';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';

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
