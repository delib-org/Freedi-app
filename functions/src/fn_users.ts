import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { db } from '.';
import { Collections, UserSchema, UserSettings } from 'delib-npm';
import { parse } from 'valibot';

export async function setUserSettings(
	e: FirestoreEvent<
		QueryDocumentSnapshot | undefined,
		{
			userId: string;
		}
	>
) {
	if (!e.data) return;

	try {
		const user = parse(UserSchema, e.data.data());

		const { uid } = user;
		if (!uid) throw new Error('uid not found');

		const userSettings: UserSettings = {
			userId: uid,
			learning: {
				evaluation: 7,
				addOptions: 3,
			},
		};

		const userSettingsRef = db.doc(`${Collections.usersSettings}/${uid}`);
		await userSettingsRef.set(userSettings);

		return;
	} catch (error) {
		console.error(error);

		return;
	}
}
