import {
	Timestamp,
	doc,
	setDoc,
	updateDoc,
	deleteDoc,
	collection,
	query,
	where,
	onSnapshot,
	serverTimestamp,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import { Collections, Creator, Online, OnlineSchema } from 'delib-npm';
import { parse } from 'valibot';

export async function setUserOnlineToDB(
	statementId: string,
	user: Creator
): Promise<string | undefined> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!user) throw new Error('User is undefined');

		const onlineId = `${user.uid}_${statementId}`;

		const onlineUser: Online = {
			statementId,
			onlineId,
			user: {
				displayName: user.displayName,
				photoURL: user.photoURL || null,
				uid: user.uid,
				isAnonymous: user.isAnonymous || false,
				email: user.email || null,
				advanceUser: user.advanceUser || false,
			},
			lastUpdated: Timestamp.now().toMillis(),
			tabInFocus: true,
		};

		// Validate with your schema
		parse(OnlineSchema, onlineUser);

		const onlineRef = doc(FireStore, Collections.online, onlineId);
		await setDoc(onlineRef, onlineUser);

		return onlineId;
	} catch (error) {
		console.error('Error setting user online:', error);

		return undefined;
	}
}

export async function updateUserTabFocusToDB(
	statementId: string,
	userId: string,
	tabInFocus: boolean
): Promise<void> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!userId) throw new Error('User ID is undefined');

		const onlineId = `${userId}_${statementId}`;
		const onlineUserRef = doc(FireStore, Collections.online, onlineId);

		await updateDoc(onlineUserRef, {
			tabInFocus,
			lastUpdated: serverTimestamp(),
		});
	} catch (error) {
		console.error('Error updating tab focus:', error);
	}
}

export async function updateUserHeartbeatToDB(
	statementId: string,
	userId: string
): Promise<void> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!userId) throw new Error('User ID is undefined');

		const onlineId = `${userId}_${statementId}`;
		const onlineUserRef = doc(FireStore, Collections.online, onlineId);

		await updateDoc(onlineUserRef, {
			lastUpdated: serverTimestamp(),
		});
	} catch (error) {
		console.error('Error updating heartbeat:', error);
	}
}

export async function removeUserFromOnlineToDB(
	statementId: string,
	userId: string
): Promise<void> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!userId) throw new Error('User ID is undefined');

		const onlineId = `${userId}_${statementId}`;
		const onlineUserRef = doc(FireStore, Collections.online, onlineId);

		await deleteDoc(onlineUserRef);
	} catch (error) {
		console.error('Error removing user from online:', error);
	}
}

export function subscribeToonlineByStatement(
	statementId: string,
	callback: (online: Online[]) => void
): () => void {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');

		const q = query(
			collection(FireStore, Collections.online),
			where('statementId', '==', statementId)
		);

		const unsubscribe = onSnapshot(q, (snapshot) => {
			const online: Online[] = [];

			snapshot.forEach((doc) => {
				try {
					const data = doc.data();
					const validatedData = parse(OnlineSchema, data);
					online.push(validatedData);
				} catch (error) {
					console.error('Error validating online user data:', error);
				}
			});

			callback(online);
		});

		return unsubscribe;
	} catch (error) {
		console.error('Error subscribing to online users:', error);

		return () => {}; // Return empty function if error
	}
}

// Helper function to get current user from store
export function getCurrentUser(): Creator | undefined {
	try {
		const storeState = store.getState();
		const creator: Creator = storeState.creator?.creator;

		return creator;
	} catch (error) {
		console.error('Error getting current user:', error);

		return undefined;
	}
}
