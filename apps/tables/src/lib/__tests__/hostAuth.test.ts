// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseAuth = vi.hoisted(() => ({
	signOut: vi.fn(),
	onAuthStateChanged: vi.fn(),
}));
const utils = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('firebase/auth', () => firebaseAuth);
vi.mock('@freedi/shared-utils', () => utils);
vi.mock('@/lib/firebase', () => ({ auth: { name: 'auth' } }));
vi.mock('@/lib/auth', () => ({ isGoogleUser: vi.fn(), signInHostWithGoogle: vi.fn() }));

import { signOutHost } from '../hostAuth';

describe('signOutHost', () => {
	beforeEach(() => {
		firebaseAuth.signOut.mockReset();
		utils.logError.mockReset();
	});

	it('signs the Firebase user out', async () => {
		firebaseAuth.signOut.mockResolvedValue(undefined);

		await signOutHost();

		expect(firebaseAuth.signOut).toHaveBeenCalledWith({ name: 'auth' });
		expect(utils.logError).not.toHaveBeenCalled();
	});

	it('logs a failed sign out with its operation and does not throw', async () => {
		const failure = new Error('network');

		firebaseAuth.signOut.mockRejectedValue(failure);

		await expect(signOutHost()).resolves.toBeUndefined();
		expect(utils.logError).toHaveBeenCalledWith(failure, {
			operation: 'tables.hostAuth.signOut',
		});
	});
});
