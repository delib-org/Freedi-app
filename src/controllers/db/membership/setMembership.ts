import { WaitingMember, WaitingMemberSchema, Collections, Role } from "delib-npm";
import { parse } from "valibot";
import { DB } from "../config";
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from "firebase/firestore";

export async function approveMembership(waitingMember: WaitingMember) {
	try {
		parse(WaitingMemberSchema, waitingMember);
		const waitingMembersRef = doc(DB, Collections.statementsSubscribe, waitingMember.statementsSubscribeId);
		await updateDoc(waitingMembersRef, { role: Role.member }); // Update the role to 'member' or whatever is appropriate

		//remove the waiting member from the waiting list
		const waitingListRef = collection(DB, Collections.awaitingUsers);
		const q = query(waitingListRef, where("statementsSubscribeId", "==", waitingMember.statementsSubscribeId));
		const results = await getDocs(q);

		if (!results.empty) {
			const batch = writeBatch(DB);

			results.forEach(doc => {
				batch.delete(doc.ref);
			});

			await batch.commit();
		}

	} catch (error) {
		// Handle error appropriately, e.g., log it or rethrow it
		console.error("Error in approveMembership:", error);
		throw error; // Rethrow the error if needed

	}
}