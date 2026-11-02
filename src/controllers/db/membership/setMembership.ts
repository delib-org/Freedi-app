import { WaitingMember, WaitingMemberSchema, Collections, Role } from '@freedi/shared-types';
import { parse } from 'valibot';
import { DB } from '../config';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { updateMemberRole } from '../subscriptions/setSubscriptions';

/**
 * Let in (member) or Decline. Decline is not a block: the person becomes
 * unsubscribed, so a later visit asks to join again (the role → waiting
 * trigger re-creates their awaitingUsers entry). Block is the only path to
 * Role.banned.
 */
export async function approveMembership(waitingMember: WaitingMember, accept: boolean) {
	try {
		parse(WaitingMemberSchema, waitingMember);
		const waitingMembersRef = doc(
			DB,
			Collections.statementsSubscribe,
			waitingMember.statementsSubscribeId,
		);
		await updateDoc(waitingMembersRef, {
			role: accept ? Role.member : Role.unsubscribed,
			lastUpdate: Date.now(),
		});

		// PHASE 3 FIX: Simplified deletion since we now use subscriptionId as document key
		// Remove the waiting member from the waiting list
		const waitingDocRef = doc(DB, Collections.awaitingUsers, waitingMember.statementsSubscribeId);
		const batch = writeBatch(DB);
		batch.delete(waitingDocRef);
		await batch.commit();
	} catch (error) {
		// Handle error appropriately, e.g., log it or rethrow it
		logError(error, {
			operation: 'membership.setMembership.approveMembership',
			metadata: { message: 'Error in approveMembership:' },
		});
		throw error; // Rethrow the error if needed
	}
}

/**
 * Puts a person back on the waiting list (Undo of Let in / Decline). The
 * subscription trigger re-creates their awaitingUsers entry for every admin.
 */
export async function returnToWaiting(waitingMember: WaitingMember): Promise<void> {
	try {
		await updateMemberRole(waitingMember.statementId, waitingMember.userId, Role.waiting);
	} catch (error) {
		logError(error, {
			operation: 'membership.setMembership.returnToWaiting',
			userId: waitingMember.userId,
			statementId: waitingMember.statementId,
		});
		throw error;
	}
}
