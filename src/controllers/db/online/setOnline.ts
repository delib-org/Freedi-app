import {
	Timestamp,
	doc,
	setDoc,
	deleteDoc,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Creator, Online, OnlineSchema } from 'delib-npm';
import { parse } from 'valibot';

export async function setUserOnlineToDB(
	statementId: string,
	user: Creator
): Promise<string | undefined> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!user) throw new Error('User is undefined');

		const onlineId = `${user.uid}--${statementId}`;

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
			// Use Timestamp.now().toMillis() to get a number that validates properly
			lastUpdated: Timestamp.now().toMillis(),
			tabInFocus: true,
		};

		// Validate with your schema
		parse(OnlineSchema, onlineUser);

		const onlineRef = doc(FireStore, Collections.online, onlineId);

		// Force write to server first, then local cache
		await setDoc(onlineRef, onlineUser, {
			merge: true,
			// This ensures the write goes to server first
		});

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

		const onlineId = `${userId}--${statementId}`;
		const onlineUserRef = doc(FireStore, Collections.online, onlineId);

		// Use setDoc with merge to create or update
		await setDoc(
			onlineUserRef,
			{
				tabInFocus,
				lastUpdated: Timestamp.now().toMillis(),
			},
			{ merge: true }
		);
	} catch (error) {
		console.error('Error updating tab focus:', error);
	}
}

export async function removeUserFromOnlineToDB(
	statementId: string,
	userId: string
): Promise<void> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!userId) throw new Error('User ID is undefined');

		const onlineId = `${userId}--${statementId}`;

		const onlineUserRef = doc(FireStore, Collections.online, onlineId);
		await deleteDoc(onlineUserRef);
	} catch (error) {
		console.error('Error removing user from online:', error);
	}
}
