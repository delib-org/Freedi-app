import { setDoc } from 'firebase/firestore';
import { DEFAULT_LANGUAGE } from '@freedi/shared-i18n';
import { logError } from '@/utils/errorHandling';
import {
	chosenLanguageOnDevice,
	saveChosenLanguage,
	saveUserLanguage,
	syncUserLanguage,
} from '../userLanguage';

jest.mock('firebase/firestore', () => ({ setDoc: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({
	createDocRef: (collection: string, id: string) => `${collection}/${id}`,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockCreator = jest.fn();
jest.mock('@/redux/store', () => ({
	store: { getState: () => ({ creator: { creator: mockCreator() } }) },
}));

const USER_DOC = 'usersV2/u1';
const NOT_DEFAULT = (DEFAULT_LANGUAGE as string) === 'he' ? 'en' : 'he';

function setDevice(shown: string | undefined, explicit?: string): void {
	localStorage.clear();
	if (shown) localStorage.setItem('userConfig', JSON.stringify({ chosenLanguage: shown }));
	if (explicit) localStorage.setItem('lang', explicit);
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('userLanguage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(setDoc).mockResolvedValue(undefined);
		localStorage.clear();
	});

	describe('saveUserLanguage', () => {
		it('merges only the language field into the owner document', async () => {
			await saveUserLanguage('u1', 'he');

			expect(setDoc).toHaveBeenCalledWith(USER_DOC, { defaultLanguage: 'he' }, { merge: true });
		});

		it('logs a failure and does not throw', async () => {
			jest.mocked(setDoc).mockRejectedValue(new Error('denied'));

			await expect(saveUserLanguage('u1', 'he')).resolves.toBeUndefined();
			expect(logError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({
					operation: 'user.userLanguage.saveUserLanguage',
					userId: 'u1',
				}),
			);
		});

		it('never writes an unsupported language', async () => {
			await saveUserLanguage('u1', 'xx');

			expect(setDoc).not.toHaveBeenCalled();
		});
	});

	describe('saveChosenLanguage', () => {
		it('saves for the signed-in person', () => {
			mockCreator.mockReturnValue({ uid: 'u1' });

			saveChosenLanguage('he');

			expect(setDoc).toHaveBeenCalledWith(USER_DOC, { defaultLanguage: 'he' }, { merge: true });
		});

		it('does nothing before sign-in', () => {
			mockCreator.mockReturnValue(null);

			saveChosenLanguage('he');

			expect(setDoc).not.toHaveBeenCalled();
		});
	});

	describe('chosenLanguageOnDevice', () => {
		it('is the language on screen when it is not the default', () => {
			setDevice(NOT_DEFAULT);

			expect(chosenLanguageOnDevice()).toBe(NOT_DEFAULT);
		});

		it('is undefined for an untouched default', () => {
			setDevice(DEFAULT_LANGUAGE);

			expect(chosenLanguageOnDevice()).toBeUndefined();
		});

		it('counts the default when the person picked it', () => {
			setDevice(DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);

			expect(chosenLanguageOnDevice()).toBe(DEFAULT_LANGUAGE);
		});

		it('falls back to the explicit key when there is no config', () => {
			setDevice(undefined, 'he');

			expect(chosenLanguageOnDevice()).toBe('he');
		});

		it('is undefined and logs when the config is corrupt', () => {
			localStorage.setItem('userConfig', '{not json');

			expect(chosenLanguageOnDevice()).toBeUndefined();
			expect(logError).toHaveBeenCalled();
		});
	});

	describe('syncUserLanguage', () => {
		it('saves when the server has no language', async () => {
			setDevice(NOT_DEFAULT);

			syncUserLanguage('u1', undefined);
			await flush();

			expect(setDoc).toHaveBeenCalledWith(
				USER_DOC,
				{ defaultLanguage: NOT_DEFAULT },
				{ merge: true },
			);
		});

		it('saves when the server differs', async () => {
			setDevice('ar');

			syncUserLanguage('u1', 'he');
			await flush();

			expect(setDoc).toHaveBeenCalledWith(USER_DOC, { defaultLanguage: 'ar' }, { merge: true });
		});

		it('does not write when they match', () => {
			setDevice(NOT_DEFAULT);

			syncUserLanguage('u1', NOT_DEFAULT);

			expect(setDoc).not.toHaveBeenCalled();
		});

		it('does not let an untouched default replace a saved choice', () => {
			setDevice(DEFAULT_LANGUAGE);

			syncUserLanguage('u1', NOT_DEFAULT);

			expect(setDoc).not.toHaveBeenCalled();
		});
	});

	// The once-a-session memory lives in the module, so each case uses its own person.
	describe('first language, when none is stored', () => {
		it('saves the untouched language on screen once', async () => {
			setDevice(DEFAULT_LANGUAGE);

			syncUserLanguage('first-untouched', undefined);
			await flush();

			expect(setDoc).toHaveBeenCalledTimes(1);
			expect(setDoc).toHaveBeenCalledWith(
				'usersV2/first-untouched',
				{ defaultLanguage: DEFAULT_LANGUAGE },
				{ merge: true },
			);
		});

		it('treats an empty stored language as missing', () => {
			setDevice(DEFAULT_LANGUAGE);

			syncUserLanguage('first-empty', '');

			expect(setDoc).toHaveBeenCalledTimes(1);
		});

		it('never overwrites a stored language with the untouched screen language', () => {
			setDevice(DEFAULT_LANGUAGE);

			syncUserLanguage('first-stored', NOT_DEFAULT);

			expect(setDoc).not.toHaveBeenCalled();
		});

		it('does not write again on a repeat call', () => {
			setDevice(DEFAULT_LANGUAGE);

			syncUserLanguage('first-repeat', undefined);
			syncUserLanguage('first-repeat', undefined);

			expect(setDoc).toHaveBeenCalledTimes(1);
		});

		it('logs a failed write and does not throw', async () => {
			setDevice(DEFAULT_LANGUAGE);
			jest.mocked(setDoc).mockRejectedValue(new Error('denied'));

			expect(() => syncUserLanguage('first-fails', undefined)).not.toThrow();
			await flush();

			expect(logError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({
					operation: 'user.userLanguage.saveUserLanguage',
					userId: 'first-fails',
				}),
			);
		});

		it('does not write an unsupported language', () => {
			setDevice('xx');

			syncUserLanguage('first-unsupported', undefined);

			expect(setDoc).not.toHaveBeenCalled();
		});

		it('does not write when the app has not recorded a language', () => {
			setDevice(undefined);

			syncUserLanguage('first-unknown', undefined);

			expect(setDoc).not.toHaveBeenCalled();
		});

		it('logs a corrupt config and writes nothing', () => {
			localStorage.setItem('userConfig', '{not json');

			expect(() => syncUserLanguage('first-corrupt', undefined)).not.toThrow();

			expect(setDoc).not.toHaveBeenCalled();
			expect(logError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({
					operation: 'user.userLanguage.saveFirstLanguage',
					userId: 'first-corrupt',
				}),
			);
		});
	});
});
