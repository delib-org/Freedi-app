import { store } from "@/redux/store";
import { collection, deleteDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { DB } from "../config";
import { Collections, NotificationType } from "delib-npm";
import { setInAppNotificationsAll } from "@/redux/notificationsSlice/notificationsSlice";

export function listenToInAppNotifications() {
	try {
		const user = store.getState().creator.creator;

		if (!user) throw new Error('User not found');

		const inAppNotificationsRef = collection(DB, Collections.inAppNotifications);
		const q = query(inAppNotificationsRef, where("userId", '==', user.uid), orderBy("createdAt", "desc"), limit(100));

		return onSnapshot(q, (inAppNotDBs) => {
			const notifications: NotificationType[] = [];
			inAppNotDBs.forEach((inAppNotDB) => {
				const inAppNot = inAppNotDB.data() as NotificationType;
				notifications.push(inAppNot);
			});
			store.dispatch(setInAppNotificationsAll(notifications));
		});
	} catch (error) {
		console.error("In listenToInAppNotifications", error.message);

		return () => { return; };
	}
}

export async function markInAppNotificationOfParentAsRead(statementId: string) {
	try {
		const user = store.getState().creator.creator;
		if (!user) throw new Error('User not found');
		const inAppNotificationsRef = collection(DB, Collections.inAppNotifications);
		const q = query(inAppNotificationsRef, where("parentId", "==", statementId), where("userId", "==", user.uid));

		const snapshot = await getDocs(q);
		snapshot.forEach((ntf) => {
			deleteDoc(ntf.ref);
		});
	} catch (error) {
		console.error("In markInAppNotificationAsRead", error.message);
	}
}