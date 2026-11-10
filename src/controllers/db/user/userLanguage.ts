/**
 * Keeps `usersV2/{uid}.defaultLanguage` in step with the language chosen on this
 * device, so server-written notices can reach each person in their language.
 * Nothing here blocks the UI, and a failed save is only logged.
 */
import { setDoc } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { DEFAULT_LANGUAGE, isValidLanguage } from '@freedi/shared-i18n';
import { store } from '@/redux/store';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import { createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

const EXPLICIT_LANGUAGE_KEY = 'lang';

/** People whose first language was already saved in this session. */
const firstLanguageSavedFor = new Set<string>();

export async function saveUserLanguage(uid: string, language: string): Promise<void> {
	if (!isValidLanguage(language)) return;

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

/** The language the app is showing. UserConfigProvider keeps this entry current. */
function languageOnScreen(): string | undefined {
	const saved = localStorage.getItem(LocalStorageObjects.UserConfig);

	return saved ? JSON.parse(saved).chosenLanguage : undefined;
}

/**
 * The language this person chose on this device, or undefined if they never
 * chose one. The app saves its config on every load, so an untouched default is
 * not a choice: on a new device it must not replace what they chose elsewhere.
 */
export function chosenLanguageOnDevice(): string | undefined {
	try {
		const explicit = localStorage.getItem(EXPLICIT_LANGUAGE_KEY) ?? undefined;
		const shown = languageOnScreen();

		if (!shown) return explicit;

		return shown !== DEFAULT_LANGUAGE || explicit ? shown : undefined;
	} catch (error) {
		logError(error, { operation: 'user.userLanguage.chosenLanguageOnDevice' });

		return undefined;
	}
}

/** Someone with no stored language gets the one on screen, at most once a session. */
function saveFirstLanguage(uid: string): void {
	if (firstLanguageSavedFor.has(uid)) return;

	try {
		const language = languageOnScreen() ?? localStorage.getItem(EXPLICIT_LANGUAGE_KEY);
		if (!language) return;

		firstLanguageSavedFor.add(uid);
		void saveUserLanguage(uid, language);
	} catch (error) {
		logError(error, { operation: 'user.userLanguage.saveFirstLanguage', userId: uid });
	}
}

/** At sign-in: fills in a missing language, or saves a language picked on this device. */
export function syncUserLanguage(uid: string, serverLanguage: string | undefined): void {
	if (!serverLanguage) {
		saveFirstLanguage(uid);

		return;
	}

	const chosen = chosenLanguageOnDevice();
	if (chosen && chosen !== serverLanguage) void saveUserLanguage(uid, chosen);
}
