/**
 * Keeps `usersV2/{uid}.defaultLanguage` in step with the language chosen on this
 * device, so server-written notices can reach each person in their language.
 * Nothing here blocks the UI, and a failed save is only logged.
 */
import { setDoc } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { DEFAULT_LANGUAGE } from '@freedi/shared-i18n';
import { store } from '@/redux/store';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import { createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

const EXPLICIT_LANGUAGE_KEY = 'lang';

export async function saveUserLanguage(uid: string, language: string): Promise<void> {
	try {
		await setDoc(
			createDocRef(Collections.users, uid),
			{ defaultLanguage: language },
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'user.userLanguage.saveUserLanguage',
			userId: uid,
			metadata: { language },
		});
	}
}

/** Saves a language the signed-in person just chose. Before sign-in, sign-in saves it. */
export function saveChosenLanguage(language: string): void {
	const uid = store.getState().creator.creator?.uid;
	if (uid) void saveUserLanguage(uid, language);
}

/**
 * The language this person chose on this device, or undefined if they never
 * chose one. The app saves its config on every load, so an untouched default is
 * not a choice: on a new device it must not replace what they chose elsewhere.
 */
export function chosenLanguageOnDevice(): string | undefined {
	try {
		const explicit = localStorage.getItem(EXPLICIT_LANGUAGE_KEY) ?? undefined;
		const saved = localStorage.getItem(LocalStorageObjects.UserConfig);
		const shown: string | undefined = saved ? JSON.parse(saved).chosenLanguage : undefined;

		if (!shown) return explicit;

		return shown !== DEFAULT_LANGUAGE || explicit ? shown : undefined;
	} catch (error) {
		logError(error, { operation: 'user.userLanguage.chosenLanguageOnDevice' });

		return undefined;
	}
}

/** At sign-in: saves the device's choice when the server has none or a different one. */
export function syncUserLanguage(uid: string, serverLanguage: string | undefined): void {
	const chosen = chosenLanguageOnDevice();
	if (chosen && chosen !== serverLanguage) void saveUserLanguage(uid, chosen);
}
