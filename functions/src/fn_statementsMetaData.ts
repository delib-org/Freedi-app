import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '.';
import { logger } from 'firebase-functions/v1';
import { Collections } from '../../src/types/TypeEnums';

type MembershipChange = {
	eventType: 'new' | 'update' | 'delete';
	isMemberAfter: boolean;
	isMemberBefore: boolean;
};

function calculateMembershipIncrement({
	eventType,
	isMemberAfter,
	isMemberBefore,
}: MembershipChange): number {
	if (eventType === 'new') return isMemberAfter ? 1 : 0;
	if (eventType === 'delete') return isMemberBefore ? -1 : 0;
	if (eventType === 'update' && isMemberAfter !== isMemberBefore) {
		return isMemberAfter ? 1 : -1;
	}

	return 0;
}

export async function addOrRemoveMemberFromStatementDB(
	statementId: string,
	eventType: 'new' | 'update' | 'delete',
	isMemberAfter: boolean,
	isMemberBefore: boolean
): Promise<void> {
	if (!statementId) {
		logger.error('statementId is required');

		return;
	}

	const increment = calculateMembershipIncrement({
		eventType,
		isMemberAfter,
		isMemberBefore,
	});
	if (increment === 0) return;

	try {
		await db.doc(`${Collections.statementsMetaData}/${statementId}`).set(
			{
				numberOfMembers: FieldValue.increment(increment),
				lastUpdate: Timestamp.now().toMillis(),
				statementId,
			},
			{ merge: true }
		);
	} catch (error) {
		logger.error('error updating statement with number of members', error);
	}
}
