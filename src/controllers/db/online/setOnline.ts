import { Timestamp, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Creator, Online, OnlineSchema } from '@freedi/shared-types';
import { parse } from 'valibot';

export async function setUserOnlineToDB(
	statementId: string,
	user: Creator,
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
	tabInFocus: boolean,
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
			{ merge: true },
		);
	} catch (error) {
		console.error('Error updating tab focus:', error);
	}
}

export async function removeUserFromOnlineToDB(
	statementId: string | null | undefined,
	userId: string | null | undefined,
): Promise<void> {
	try {
		// Early return if either parameter is null/undefined
		if (!statementId || !userId) {
			console.info('removeUserFromOnlineToDB: Skipping - missing statementId or userId');

			return;
		}

		// Validate that parameters are valid strings
		if (typeof statementId !== 'string' || typeof userId !== 'string') {
			console.error('removeUserFromOnlineToDB: Invalid parameter types');

			return;
		}

		// Additional validation to prevent empty strings
		if (statementId.trim() === '' || userId.trim() === '') {
			console.error('removeUserFromOnlineToDB: Empty statementId or userId');

			return;
		}

		const onlineId = `${userId}--${statementId}`;

		// Check if document exists before trying to delete
		const onlineUserRef = doc(FireStore, Collections.online, onlineId);
		const docSnapshot = await getDoc(onlineUserRef);

		if (docSnapshot.exists()) {
			await deleteDoc(onlineUserRef);
		}
	} catch (error) {
		// Only log actual errors, not permission issues from non-existent docs
		const err = error as { code?: string; message?: string };
		if (err?.code !== 'permission-denied' || err?.message?.includes('document does not exist')) {
			console.error('Error removing user from online:', error);
		}
	}
}
