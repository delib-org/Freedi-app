import { collection, query, Unsubscribe, where, getDocs, limit } from "firebase/firestore";
import { DB } from "../config";
import { Collections, WaitingMember } from "delib-npm";
import { store } from "@/redux/store";
import { removeWaitingMember, setWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";
import { createManagedCollectionListener, generateListenerKey } from "@/controllers/utils/firestoreListenerHelpers";

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

		const listenerKey = generateListenerKey('waiting-members', 'user', user.uid);
		let unsubscribe: Unsubscribe | null = null;

		// Check if user is admin before setting up listener
		checkIfUserIsAdmin(user.uid).then(isAdmin => {
			if (isAdmin) {
				const waitingList = collection(DB, Collections.awaitingUsers);
				const q = query(waitingList, where("adminId", "==", user.uid));

				// Use managed collection listener with document counting
				unsubscribe = createManagedCollectionListener(
					q,
					listenerKey,
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
					},
					'query'
				);
			}
			// Removed console.info to reduce noise - this is expected behavior for non-admins
		});

		// Return a cleanup function
		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	} catch (error) {
		console.error("Error setting up waiting members listener:", error);

		return () => {};
	}
}
