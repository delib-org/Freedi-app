// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseAuth = vi.hoisted(() => ({
	GoogleAuthProvider: class GoogleAuthProvider {},
	linkWithPopup: vi.fn(),
	signInWithPopup: vi.fn(),
	signInAnonymously: vi.fn(),
	onAuthStateChanged: vi.fn(),
}));
const fakeAuth = vi.hoisted(() => ({ currentUser: null as null | { isAnonymous: boolean } }));
const utils = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('firebase/auth', () => firebaseAuth);
vi.mock('@freedi/shared-utils', () => utils);
vi.mock('@/lib/firebase', () => ({ auth: fakeAuth }));

import { signInHostWithGoogle } from '../auth';

const GOOGLE_USER = { uid: 'g1', isAnonymous: false };

describe('signInHostWithGoogle', () => {
	beforeEach(() => {
		firebaseAuth.linkWithPopup.mockReset();
		firebaseAuth.signInWithPopup.mockReset().mockResolvedValue({ user: GOOGLE_USER });
		utils.logError.mockReset();
		fakeAuth.currentUser = null;
	});

	it('signs in normally when nobody is signed in', async () => {
		await expect(signInHostWithGoogle()).resolves.toBe(GOOGLE_USER);
		expect(firebaseAuth.linkWithPopup).not.toHaveBeenCalled();
	});

	it('links an anonymous user, so their uid and registration survive', async () => {
		const anonymous = { isAnonymous: true };

		fakeAuth.currentUser = anonymous;
		firebaseAuth.linkWithPopup.mockResolvedValue({ user: { uid: 'anon-1', isAnonymous: false } });

		const user = await signInHostWithGoogle();

		expect(firebaseAuth.linkWithPopup).toHaveBeenCalledWith(anonymous, expect.anything());
		expect(firebaseAuth.signInWithPopup).not.toHaveBeenCalled();
		expect(user.uid).toBe('anon-1');
	});

	it('falls back to a plain sign-in when the Google account is already another user', async () => {
		fakeAuth.currentUser = { isAnonymous: true };
		firebaseAuth.linkWithPopup.mockRejectedValue({ code: 'auth/credential-already-in-use' });

		await expect(signInHostWithGoogle()).resolves.toBe(GOOGLE_USER);
		expect(firebaseAuth.signInWithPopup).toHaveBeenCalledTimes(1);
		expect(utils.logError).not.toHaveBeenCalled();
	});

	it('logs and rethrows any other link failure', async () => {
		const failure = { code: 'auth/popup-closed-by-user' };

		fakeAuth.currentUser = { isAnonymous: true };
		firebaseAuth.linkWithPopup.mockRejectedValue(failure);

		await expect(signInHostWithGoogle()).rejects.toBe(failure);
		expect(firebaseAuth.signInWithPopup).not.toHaveBeenCalled();
		expect(utils.logError).toHaveBeenCalledWith(failure, {
			operation: 'tables.auth.signInHostWithGoogle',
		});
	});
});
