import { setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { Creator, Online, OnlineSchema, Collections } from '@freedi/shared-types';
import { parse } from 'valibot';
import { createDocRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

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
			lastUpdated: getCurrentTimestamp(),
			tabInFocus: true,
		};

		// Validate with your schema
		parse(OnlineSchema, onlineUser);

		const onlineRef = createDocRef(Collections.online, onlineId);

		// Force write to server first, then local cache
		await setDoc(onlineRef, onlineUser, {
			merge: true,
			// This ensures the write goes to server first
		});

		return onlineId;
	} catch (error) {
		logError(error, {
			operation: 'online.setOnline.unknown',
			metadata: { message: 'Error setting user online:' },
		});

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
		const onlineUserRef = createDocRef(Collections.online, onlineId);

		// Use setDoc with merge to create or update
		await setDoc(
			onlineUserRef,
			{
				tabInFocus,
				lastUpdated: getCurrentTimestamp(),
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'online.setOnline.updateUserTabFocusToDB',
			metadata: { message: 'Error updating tab focus:' },
		});
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
			logError(new Error('removeUserFromOnlineToDB: Invalid parameter types'), {
				operation: 'online.setOnline.removeUserFromOnlineToDB',
			});

			return;
		}

		// Additional validation to prevent empty strings
		if (statementId.trim() === '' || userId.trim() === '') {
			logError(new Error('removeUserFromOnlineToDB: Empty statementId or userId'), {
				operation: 'online.setOnline.removeUserFromOnlineToDB',
			});

			return;
		}

		const onlineId = `${userId}--${statementId}`;

		// Check if document exists before trying to delete
		const onlineUserRef = createDocRef(Collections.online, onlineId);
		const docSnapshot = await getDoc(onlineUserRef);

		if (docSnapshot.exists()) {
			await deleteDoc(onlineUserRef);
		}
	} catch (error) {
		// Only log actual errors, not permission issues from non-existent docs
		const err = error as { code?: string; message?: string };
		if (err?.code !== 'permission-denied' || err?.message?.includes('document does not exist')) {
			logError(error, {
				operation: 'online.setOnline.unknown',
				metadata: { message: 'Error removing user from online:' },
			});
		}
	}
}
