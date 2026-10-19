// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut, clearTeacherNav, resetLibrary } = vi.hoisted(() => ({
	signOut: vi.fn(),
	clearTeacherNav: vi.fn(),
	resetLibrary: vi.fn(),
}));

vi.mock('../firebase', () => ({
	auth: { currentUser: null },
	signOut,
	canCompleteRedirectSignIn: vi.fn(),
	signInAnonymously: vi.fn(),
	signInWithCredential: vi.fn(),
	signInWithCustomToken: vi.fn(),
	GoogleAuthProvider: vi.fn(),
	signInWithPopup: vi.fn(),
	signInWithRedirect: vi.fn(),
	getRedirectResult: vi.fn(),
	linkWithPopup: vi.fn(),
	onAuthStateChanged: vi.fn(),
}));
vi.mock('../teacherNav', () => ({ clearTeacherNav }));
vi.mock('../scenarioLibrary/state', () => ({ resetLibrary }));

import { signOutTeacher } from '../user';

describe('signOutTeacher', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('signs out, then forgets the last account', async () => {
		signOut.mockResolvedValue(undefined);

		await signOutTeacher();

		expect(signOut).toHaveBeenCalledTimes(1);
		expect(clearTeacherNav).toHaveBeenCalledTimes(1);
		expect(resetLibrary).toHaveBeenCalledTimes(1);
	});

	it('rejects and keeps the caches when the sign-out fails', async () => {
		signOut.mockRejectedValue(new Error('network'));

		await expect(signOutTeacher()).rejects.toThrow('network');

		expect(clearTeacherNav).not.toHaveBeenCalled();
		expect(resetLibrary).not.toHaveBeenCalled();
	});
});
