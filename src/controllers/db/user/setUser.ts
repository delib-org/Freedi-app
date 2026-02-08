import { setUserAdvanceUser } from "@/redux/creator/creatorSlice";
import { store } from "@/redux/store";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { DB } from "../config";
import { Creator } from '@freedi/shared-types';

export async function setUserAdvanceUserToDB(advanceUser: boolean) {
	try {
		const dispatch = store.dispatch;
		const user = store.getState().creator.creator;
		if (!user) throw new Error("User not found in state");

		dispatch(setUserAdvanceUser(advanceUser));

		const userDocRef = doc(DB, 'usersV2', user.uid);
		await updateDoc(userDocRef, {
			advanceUser: advanceUser,
		});

	} catch (error) {
		console.error("Error setting user advance status:", error);
	}
}

export async function setUserToDB(user: Creator) {
	try {
		const dispatch = store.dispatch;
		const userDocRef = doc(DB, 'usersV2', user.uid);

		// Use atomic merge operation to avoid read-before-write race condition
		// This will create the document if it doesn't exist, or merge if it does
		// merge: true ensures we don't overwrite existing fields we don't specify
		await setDoc(userDocRef, {
			displayName: user.displayName || "",
			email: user.email || "",
			photoURL: user.photoURL || "",
			uid: user.uid,
			// Only set isAnonymous on first creation (when document doesn't exist)
			// If document exists, isAnonymous field won't be touched due to merge: true
			...(user.isAnonymous ? { isAnonymous: true } : {})
		}, { merge: true });

		// Optionally fetch user data to get advanceUser status
		// This is now separated from the write operation to avoid race conditions
		try {
			const userDB = await getDoc(userDocRef);
			if (userDB.exists()) {
				const existingUser = userDB.data() as Creator;
				dispatch(setUserAdvanceUser(existingUser.advanceUser || false));
			}
		} catch (error) {
			// Non-critical error, just log it
			console.error("Error fetching user advanceUser status:", error);
		}
	} catch (error) {
		console.error("Error updating user in DB:", error);
	}
}