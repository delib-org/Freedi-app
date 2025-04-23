import { collection, onSnapshot, query, Unsubscribe, where } from "firebase/firestore";
import { DB } from "../config";
import { Collections, WaitingMember } from "delib-npm";
import { store } from "@/redux/store";
import { removeWaitingMember, setWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";

export function listenToWaitingForMembership(): Unsubscribe {
	try {
		const user = store.getState().creator.creator;
		const dispatch = store.dispatch;
		if (!user) {
			throw new Error("User not found in the store.");
		}
		const waitingList = collection(DB, Collections.awaitingUsers);
		const q = query(waitingList, where("adminId", "==", user.uid));

		return onSnapshot(q, (waitingMembersDB) => {
			waitingMembersDB.docChanges().forEach((change) => {
				const subscription = change.doc.data() as WaitingMember;
				if (change.type === "added" || change.type === "modified") {
					dispatch(setWaitingMember(subscription));

				} else if (change.type === "removed") {
					dispatch(removeWaitingMember(subscription.statementsSubscribeId));
					// Handle removal if needed
				}
			})
		});
	} catch (error) {
		// Handle error appropriately, e.g., log it or rethrow it
		console.error("Error in listenToWaitingForMembership:", error);
		throw error; // Rethrow the error if needed
	}
}
