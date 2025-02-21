import { doc, getDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import { setUserSettings } from '@/redux/users/userSlice';
import { Collections } from '@/types/TypeEnums';
import { User, UserSchema } from '@/types/user/User';
import { parse } from 'valibot';
import { Agreement } from '@/types/agreement/Agreement';
import { userSettingsSchema } from '@/types/user/UserSettings';

// get user font size and update document and html with the size in the FireStore
export async function getUserFromDB(): Promise<User | undefined> {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('user is not logged in');

		const userRef = doc(FireStore, Collections.users, user.uid);
		const userDoc = await getDoc(userRef);

		if (!userDoc.exists()) throw new Error('user does not exist');

		const userDB = parse(UserSchema, userDoc.data());

		if (
			userDB.fontSize === undefined ||
			typeof userDB.fontSize !== 'number' ||
			isNaN(userDB.fontSize)
		)
			userDB.fontSize = 14;
		if (typeof userDB.fontSize !== 'number')
			throw new Error('fontSize is not a number');

		return userDB;
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

export interface SignatureDB {
	agreement: string;
	version: string;
}

export function getSignature(
	version = 'basic',
	t: (text: string) => string
): Agreement | undefined {
	try {
		const agreement: Agreement = {
			text: t('Agreement Description'),
			version,
			date: new Date().getTime(),
		};

		return agreement;
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

export function listenToUserSettings(): Unsubscribe {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('user is not logged in');

		const userSettingsRef = doc(
			FireStore,
			Collections.usersSettings,
			user.uid
		);

		return onSnapshot(userSettingsRef, (settingsDB) => {
			if (!settingsDB.data()) {
				store.dispatch(setUserSettings(null));

				return;
			}

			const userSettings = parse(userSettingsSchema, settingsDB.data());
			store.dispatch(setUserSettings(userSettings));
		});
	} catch (error) {
		console.error(error);
		store.dispatch(setUserSettings(null));

		return () => {
			return;
		};
	}
}
