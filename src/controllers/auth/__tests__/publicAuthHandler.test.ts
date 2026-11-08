/**
 * Regression tests for the auto-auth entry point.
 *
 * The bug these guard against: a signed-in Google user opening a statement got
 * signed in anonymously on top of their own session (they came back as a
 * two-word pseudonym and posted under it), because Firebase restores the
 * persisted session asynchronously and the handler read `auth.currentUser`
 * before that finished.
 */

import type { User } from 'firebase/auth';

const mockSignInAnonymously = jest.fn();
const mockSignInWithPopup = jest.fn();
const mockUpdateProfile = jest.fn();

jest.mock('firebase/auth', () => ({
	signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
	signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
	updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
	linkWithCredential: jest.fn(),
	GoogleAuthProvider: class {
		setCustomParameters() {
			/* noop */
		}
	},
}));

interface MockAuth {
	currentUser: User | null;
	authStateReady: () => Promise<void>;
}

const mockAuth: MockAuth = {
	currentUser: null,
	authStateReady: jest.fn(async () => undefined),
};

jest.mock('@/controllers/db/config', () => ({
	get auth() {
		return mockAuth;
	},
}));

jest.mock('@/controllers/db/user/setUser', () => ({
	setUserToDB: jest.fn(async () => undefined),
}));

jest.mock('@/utils/userUtils', () => ({
	convertFirebaseUserToCreator: (user: User) => ({ uid: user.uid, displayName: user.displayName }),
}));

import { handlePublicAutoAuth } from '../publicAuthHandler';

const googleUser = { uid: 'google-uid', displayName: 'Tal Yaron', isAnonymous: false } as User;
const anonUser = { uid: 'anon-uid', displayName: null, isAnonymous: true } as User;

describe('handlePublicAutoAuth', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
		sessionStorage.clear();
		mockAuth.currentUser = null;
		mockAuth.authStateReady = jest.fn(async () => undefined);
		mockSignInAnonymously.mockResolvedValue({ user: anonUser });
		mockUpdateProfile.mockResolvedValue(undefined);
	});

	it('waits for the persisted session to restore before deciding', async () => {
		// currentUser is null now and only becomes the Google user once the
		// restore resolves - exactly the cold-load timing that caused the bug.
		mockAuth.authStateReady = jest.fn(async () => {
			mockAuth.currentUser = googleUser;
		});

		await handlePublicAutoAuth();

		expect(mockAuth.authStateReady).toHaveBeenCalled();
		expect(mockSignInAnonymously).not.toHaveBeenCalled();
		expect(mockSignInWithPopup).not.toHaveBeenCalled();
		expect(mockAuth.currentUser).toBe(googleUser);
	});

	it('does not sign in anonymously when a session is already restored', async () => {
		mockAuth.currentUser = googleUser;

		await handlePublicAutoAuth();

		expect(mockSignInAnonymously).not.toHaveBeenCalled();
	});

	it('signs in anonymously for a genuinely signed-out visitor', async () => {
		await handlePublicAutoAuth();

		expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
		expect(mockUpdateProfile).toHaveBeenCalledWith(
			anonUser,
			expect.objectContaining({ displayName: expect.any(String) }),
		);
	});

	it('coalesces concurrent callers onto one sign-in', async () => {
		await Promise.all([handlePublicAutoAuth(), handlePublicAutoAuth(), handlePublicAutoAuth()]);

		expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
	});
});
