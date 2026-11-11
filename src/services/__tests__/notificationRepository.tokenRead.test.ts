/**
 * Reading a device's token doc: the rules hide a doc that still names the last
 * person who signed in on this browser, and that must read as "not registered"
 * so the caller re-registers the token for the current user.
 */

const mockGetDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
	setDoc: jest.fn(),
	doc: jest.fn(),
	deleteDoc: jest.fn(),
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
	getDocs: jest.fn(),
	query: jest.fn(),
	where: jest.fn(),
	collection: jest.fn(),
	writeBatch: jest.fn(),
	Timestamp: { now: jest.fn() },
}));

jest.mock('@/controllers/db/config', () => ({
	DB: {},
	auth: { currentUser: { uid: 'user-1' } },
}));

jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	removeTokenFromSubscription: jest.fn(),
}));

jest.mock('../platformService', () => ({
	getDeviceInfo: jest.fn(),
}));

import { getTokenLastRefresh, getTokenMetadata } from '../notificationRepository';

describe('getTokenMetadata', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns the document when it is mine', async () => {
		const data = { token: 'tok', userId: 'user-1' };
		mockGetDoc.mockResolvedValue({ exists: () => true, data: () => data });

		await expect(getTokenMetadata('tok')).resolves.toEqual(data);
	});

	it('returns null for a token not registered yet', async () => {
		mockGetDoc.mockResolvedValue({ exists: () => false });

		await expect(getTokenMetadata('tok')).resolves.toBeNull();
	});

	it('treats a document the rules hide as not registered', async () => {
		mockGetDoc.mockRejectedValue({ code: 'permission-denied' });

		await expect(getTokenMetadata('tok')).resolves.toBeNull();
	});

	it('still surfaces any other failure', async () => {
		const failure = { code: 'unavailable' };
		mockGetDoc.mockRejectedValue(failure);

		await expect(getTokenMetadata('tok')).rejects.toBe(failure);
	});

	it('gives no last refresh for a hidden document, so the caller re-registers', async () => {
		mockGetDoc.mockRejectedValue({ code: 'permission-denied' });

		await expect(getTokenLastRefresh('tok')).resolves.toBeNull();
	});
});
