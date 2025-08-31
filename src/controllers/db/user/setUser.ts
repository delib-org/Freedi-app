import { setUserAdvanceUser } from "@/redux/creator/creatorSlice";
import { store } from "@/redux/store";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { DB } from "../config";
import { Collections, Creator } from "delib-npm";

export async function setUserAdvanceUserToDB(advanceUser: boolean) {
	try {
		const dispatch = store.dispatch;
		const user = store.getState().creator.creator;
		if (!user) throw new Error("User not found in state");

		dispatch(setUserAdvanceUser(advanceUser));

		const userDocRef = doc(DB, Collections.users, user.uid);
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
		const userDocRef = doc(DB, Collections.users, user.uid);
		const userDB = await getDoc(userDocRef);
		if (!userDB.exists()) {
			// Create new user document
			await setDoc(userDocRef, {
				displayName: user.displayName || "",
				email: user.email || "",
				isAnonymous: user.isAnonymous || false,
				photoURL: user.photoURL || "",
				uid: user.uid,
			}, { merge: true }).then(() => {
				console.info("User created successfully");
			}).catch((error) => {
				console.error("Error creating user:", error);
			});
		} else {
			// Update existing user if needed
			const existingUser = userDB.data() as Creator;
			
			// Only update displayName for anonymous users getting a new temporal name
			// NEVER change isAnonymous status for existing users
			if (user.isAnonymous && user.displayName && user.displayName !== existingUser.displayName) {
				await updateDoc(userDocRef, {
					displayName: user.displayName,
					// DO NOT update isAnonymous - keep the existing value
				}).then(() => {
					console.info("Anonymous user displayName updated successfully");
				}).catch((error) => {
					console.error("Error updating anonymous user displayName:", error);
				});
			}
			
			dispatch(setUserAdvanceUser(existingUser.advanceUser || false));
		}
	} catch (error) {
		console.error("Error updating user in DB:", error);
	}
}