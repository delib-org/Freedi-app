import { collection, onSnapshot, query, Unsubscribe, where, getDocs, limit } from "firebase/firestore";
import { DB } from "../config";
import { Collections, WaitingMember } from "delib-npm";
import { store } from "@/redux/store";
import { removeWaitingMember, setWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";
import { listenerManager } from "@/controllers/utils/ListenerManager";

/**
 * Check if the user has admin role in any statement
 * @param userId User ID to check
 * @returns Promise<boolean> indicating if user is admin anywhere
 */
export async function checkIfUserIsAdmin(userId: string): Promise<boolean> {
	try {
		const subscriptionsQuery = query(
			collection(DB, Collections.statementsSubscribe),
			where("userId", "==", userId),
			where("role", "==", "admin"),
			limit(1) // We only need to know if at least one exists
		);

		const snapshot = await getDocs(subscriptionsQuery);

		return !snapshot.empty;
	} catch (error) {
		console.error("Error checking admin status:", error);

		return false;
	}
}

/**
 * Listen to waiting members for approval
 * Only initializes if the user is an admin of at least one statement
 * @returns Unsubscribe function
 */
export function listenToWaitingForMembership(): Unsubscribe {
	try {
		const user = store.getState().creator.creator;
		const dispatch = store.dispatch;

		if (!user || !user.uid) {
			console.info("User not found in the store or missing uid");

			return () => {};
		}

		const listenerKey = `waiting-members-${user.uid}`;

		// Setup function for the listener
		const setupListener = () => {
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
					// Remove the failed listener from manager
					listenerManager.removeListener(listenerKey);
				}
			);

			return unsubscribe;
		};

		// Check if user is admin before setting up listener
		checkIfUserIsAdmin(user.uid).then(isAdmin => {
			if (isAdmin) {
				// Use ListenerManager to prevent duplicates
				listenerManager.addListener(listenerKey, setupListener);
			} else {
				console.info("User is not an admin, skipping waiting members listener");
			}
		});

		// Return a cleanup function that removes the listener from the manager
		return () => {
			listenerManager.removeListener(listenerKey);
		};
	} catch (error) {
		console.error("Error setting up waiting members listener:", error);

		return () => {};
	}
}
