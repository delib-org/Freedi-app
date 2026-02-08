import { WaitingMember, WaitingMemberSchema, Collections, Role } from '@freedi/shared-types';
import { parse } from "valibot";
import { DB } from "../config";
import { doc, updateDoc, writeBatch } from "firebase/firestore";

export async function approveMembership(waitingMember: WaitingMember, accept: boolean) {
	try {
		parse(WaitingMemberSchema, waitingMember);
		const waitingMembersRef = doc(DB, Collections.statementsSubscribe, waitingMember.statementsSubscribeId);
		await updateDoc(waitingMembersRef, { role: accept ? Role.member : Role.banned }); // Update the role to 'member' or whatever is appropriate

		// PHASE 3 FIX: Simplified deletion since we now use subscriptionId as document key
		// Remove the waiting member from the waiting list
		const waitingDocRef = doc(DB, Collections.awaitingUsers, waitingMember.statementsSubscribeId);
		const batch = writeBatch(DB);
		batch.delete(waitingDocRef);
		await batch.commit();

	} catch (error) {
		// Handle error appropriately, e.g., log it or rethrow it
		console.error("Error in approveMembership:", error);
		throw error; // Rethrow the error if needed

	}
}