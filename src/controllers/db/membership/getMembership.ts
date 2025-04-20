import { collection, getDocs, onSnapshot, query, Unsubscribe, where } from "firebase/firestore";
import { DB } from "../config";
import { Collections, Role, StatementSubscription } from "delib-npm";
import { store } from "@/redux/store";
import { deleteSubscribedStatement, setStatementSubscription } from "@/redux/statements/statementsSlice";

export async function listenToWaitingForMembership(): Promise<Unsubscribe[]> {
	try {
		const user = store.getState().creator.creator;
		if (!user) {
			throw new Error("User not found in the store.");
		}
		const userId = user.id;
		//get users' admin groups
		const subscriptionsRef = collection(DB, Collections.statementsSubscribe);
		const q = query(subscriptionsRef, where("userId", "==", userId), where("statement.parentId", "==", "top"));
		const groupsDB = await getDocs(q);
		const groups = groupsDB.docs.map((doc) => doc.data() as StatementSubscription);
		if (groups.length === 0) return []; // No groups found, return empty array
		const unsubscribes: Unsubscribe[] = [];

		groups.forEach(group => {
			const groupId = group.statement.statementId;
			unsubscribes.push(listenToGroupWaitingForMembership(groupId));
		});

		return unsubscribes;
	} catch (error) {
		// Handle error appropriately, e.g., log it or rethrow it
		console.error("Error in listenToWaitingForMembership:", error);
		throw error; // Rethrow the error if needed
	}
}

function listenToGroupWaitingForMembership(groupId: string) {
	try {

		const dispatch = store.dispatch;

		const groupRef = collection(DB, Collections.statementsSubscribe);
		const q = query(groupRef, where("groupId", "==", groupId), where("status", "==", Role.waiting));
		const unsubscribe = onSnapshot(q, (snapshot) => {
			snapshot.docChanges().forEach((change) => {

				const subscription = change.doc.data() as StatementSubscription;
				console.log("listen to group", subscription.statement);
				if (change.type === "added" || change.type === "modified") {
					dispatch(setStatementSubscription(subscription));
				} else if (change.type === "removed") {
					dispatch(deleteSubscribedStatement(subscription.statementId));
				}
			});
		});

		return unsubscribe;
	} catch (error) {
		console.error("Error in listenToGroupWaitingForMembership:", error);
		throw error; // Rethrow the error if needed
	}
}