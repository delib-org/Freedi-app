/**
 * Agora guest mode: the gate's decisions and the way back.
 *
 * Guarded here: the code is redeemed for the app it was minted for, the
 * guest is known by the server's pseudonym (never a name typed earlier on
 * the device), the way back is built from the constant Agora origin and the
 * ids — and "Back to the village" signs out, tells the opener and closes.
 */

const mockSignInWithCustomToken = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockUpdateProfile = jest.fn(async () => undefined);
const mockRedeem = jest.fn();
const mockSetUserToDB = jest.fn(async () => undefined);

jest.mock('firebase/auth', () => ({
	signInWithCustomToken: (...args: unknown[]) => mockSignInWithCustomToken(...args),
	signOut: (...args: unknown[]) => mockSignOut(...(args as [])),
	updateProfile: (...args: unknown[]) => mockUpdateProfile(...(args as [])),
}));
jest.mock('firebase/functions', () => ({
	httpsCallable: () => (data: unknown) => mockRedeem(data),
}));

const mockAuth: { currentUser: { uid: string } | null } = { currentUser: null };
jest.mock('@/controllers/db/config', () => ({
	get auth() {
		return mockAuth;
	},
	functions: {},
}));
jest.mock('@/controllers/db/user/setUser', () => ({
	setUserToDB: (...args: unknown[]) => mockSetUserToDB(...(args as [])),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

import {
	CLOSE_FALLBACK_MS,
	guestFailureOf,
	holdsRealAccount,
	leaveToVillage,
	signInAsAgoraGuest,
	villageReturnUrl,
} from '../agoraGuest';

describe('agoraGuest', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAuth.currentUser = null;
		localStorage.clear();
	});

	it('builds the way back from the constant origin and the ids', () => {
		expect(
			villageReturnUrl({ sessionId: 's1', itemId: 'linked-1' }, 'https://agora.wizcol.com'),
		).toBe('https://agora.wizcol.com/#!/play/s1?at=booth%3Alinked-1&back=1');
	});

	it('asks before replacing a real account, never an anonymous one', () => {
		expect(holdsRealAccount(null)).toBe(false);
		expect(holdsRealAccount({ isAnonymous: true, providerData: [] })).toBe(false);
		expect(holdsRealAccount({ isAnonymous: false, providerData: [] })).toBe(false);
		expect(
			holdsRealAccount({
				isAnonymous: false,
				providerData: [{ providerId: 'google.com' } as never],
			}),
		).toBe(true);
	});

	it('reads why a redeem was refused', () => {
		expect(guestFailureOf({ details: { reason: 'ended' } })).toBe('ended');
		expect(guestFailureOf({ details: { reason: 'expired' } })).toBe('expired');
		expect(guestFailureOf({ details: { reason: 'wrong_app' } })).toBe('expired');
		expect(guestFailureOf(new Error('offline'))).toBe('failed');
	});

	it('signs in as the student under the server pseudonym, forgetting a typed name', async () => {
		localStorage.setItem('displayName', 'Dana Levi');
		mockAuth.currentUser = { uid: 'someone-else' };
		mockRedeem.mockResolvedValue({
			data: {
				token: 'tok',
				displayName: 'Brave Owl',
				sessionId: 's1',
				itemId: 'linked-1',
				statementId: 'q1',
			},
		});
		const user = { uid: 'student-1' };
		mockSignInWithCustomToken.mockResolvedValue({ user });

		const claim = await signInAsAgoraGuest('code-1');

		expect(mockRedeem).toHaveBeenCalledWith({ code: 'code-1', app: 'main' });
		expect(mockSignOut).toHaveBeenCalled();
		expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockAuth, 'tok');
		expect(mockUpdateProfile).toHaveBeenCalledWith(user, { displayName: 'Brave Owl' });
		expect(mockSetUserToDB).toHaveBeenCalledWith(
			expect.objectContaining({ uid: 'student-1', displayName: 'Brave Owl', email: null }),
		);
		expect(localStorage.getItem('displayName')).toBeNull();
		expect(claim).toEqual({ s: 's1', i: 'linked-1', q: 'q1' });
	});

	it('signs out, tells the opening tab and closes', async () => {
		jest.useFakeTimers();
		const postMessage = jest.fn();
		const close = jest.spyOn(window, 'close').mockImplementation(() => undefined);
		Object.defineProperty(window, 'opener', {
			value: { closed: false, postMessage },
			configurable: true,
		});

		await leaveToVillage({ sessionId: 's1', itemId: 'linked-1' }, true);

		expect(mockSignOut).toHaveBeenCalled();
		expect(postMessage).toHaveBeenCalledWith(
			{ type: 'agora-station-return', itemId: 'linked-1' },
			'https://agora.wizcol.com',
		);
		expect(close).toHaveBeenCalled();
		expect(CLOSE_FALLBACK_MS).toBeGreaterThan(0);
		Object.defineProperty(window, 'opener', { value: null, configurable: true });
		close.mockRestore();
		jest.useRealTimers();
	});
});
