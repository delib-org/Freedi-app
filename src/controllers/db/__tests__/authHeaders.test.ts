const mockGetIdToken = jest.fn<Promise<string>, []>();
const mockAuthStateReady = jest.fn<Promise<void>, []>();

jest.mock('../config', () => ({
	auth: {
		authStateReady: () => mockAuthStateReady(),
		currentUser: { getIdToken: () => mockGetIdToken() } as {
			getIdToken: () => Promise<string>;
		} | null,
	},
}));

import { getAuthHeaders } from '../authHeaders';
import { auth } from '../config';

describe('getAuthHeaders', () => {
	const signedIn = auth.currentUser;

	beforeEach(() => {
		jest.clearAllMocks();
		mockAuthStateReady.mockResolvedValue(undefined);
		Object.assign(auth, { currentUser: signedIn });
	});

	it('returns a Bearer header for the current user, anonymous users included', async () => {
		mockGetIdToken.mockResolvedValue('anon-token');

		await expect(getAuthHeaders()).resolves.toEqual({
			'Content-Type': 'application/json',
			Authorization: 'Bearer anon-token',
		});
	});

	it('waits for auth to restore before reading the user', async () => {
		mockGetIdToken.mockResolvedValue('token');
		await getAuthHeaders();

		expect(mockAuthStateReady.mock.invocationCallOrder[0]).toBeLessThan(
			mockGetIdToken.mock.invocationCallOrder[0],
		);
	});

	it('throws when nobody is signed in', async () => {
		Object.assign(auth, { currentUser: null });

		await expect(getAuthHeaders()).rejects.toThrow('User not authenticated');
	});
});
