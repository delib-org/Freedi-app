import { collection, onSnapshot, query, Unsubscribe, where } from "firebase/firestore";
import { DB } from "../config";
import { Collections, WaitingMember } from "delib-npm";
import { store } from "@/redux/store";
import { removeWaitingMember, setWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";

// Feature flag to temporarily disable the waiting list listener due to Firestore issues
const ENABLE_WAITING_LIST_LISTENER = false;

export function listenToWaitingForMembership(): Unsubscribe {
	try {
		// Temporarily disable this listener to prevent Firestore internal state errors
		if (!ENABLE_WAITING_LIST_LISTENER) {
			console.info("Waiting list listener is temporarily disabled");

			return () => {};
		}

		const user = store.getState().creator.creator;
		const dispatch = store.dispatch;

		if (!user || !user.uid) {
			console.error("User not found in the store or missing uid");

			return () => {};
		}

		const waitingList = collection(DB, Collections.awaitingUsers);
		const q = query(waitingList, where("adminId", "==", user.uid));

		const unsubscribe = onSnapshot(
			q,
			(waitingMembersDB) => {
				try {
					waitingMembersDB.docChanges().forEach((change) => {
						const subscription = change.doc.data() as WaitingMember;
						if (change.type === "added" || change.type === "modified") {
							dispatch(setWaitingMember(subscription));
						} else if (change.type === "removed") {
							dispatch(removeWaitingMember(subscription.statementsSubscribeId));
						}
					});
				} catch (error) {
					console.error("Error processing waiting members snapshot:", error);
				}
			},
			(error) => {
				console.error("Error in waiting members listener:", error);
			}
		);

		return unsubscribe;
	} catch (error) {
		console.error("Error setting up waiting members listener:", error);

		return () => {};
	}
}
