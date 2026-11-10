/**
 * Sign-out: the token leaves only the subscriptions that still list it, so a
 * person with hundreds of subscriptions costs no extra reads or writes.
 */

const mockGetDocs = jest.fn();
const mockRemoveToken = jest.fn((..._args: unknown[]) => Promise.resolve());

jest.mock('firebase/firestore', () => ({
	setDoc: jest.fn(),
	doc: jest.fn(),
	deleteDoc: jest.fn(),
	getDoc: jest.fn(),
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	query: jest.fn(() => ({})),
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
	removeTokenFromSubscription: (...args: unknown[]) => mockRemoveToken(...args),
}));

jest.mock('../platformService', () => ({
	getDeviceInfo: jest.fn(),
}));

import { removeTokenFromAllSubscriptions } from '../notificationRepository';

const subscription = (id: string, tokens?: unknown) => ({
	id,
	data: () => ({ statementId: `st-${id}`, ...(tokens === undefined ? {} : { tokens }) }),
});

describe('removeTokenFromAllSubscriptions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('removes the token only where it is still listed', async () => {
		mockGetDocs.mockResolvedValue({
			docs: [subscription('a', ['tok']), subscription('b', ['other']), subscription('c')],
		});

		await removeTokenFromAllSubscriptions('user-1', 'tok');

		expect(mockRemoveToken).toHaveBeenCalledTimes(1);
		expect(mockRemoveToken).toHaveBeenCalledWith('st-a', 'user-1', 'tok');
	});

	it('does nothing without a user or a token', async () => {
		await removeTokenFromAllSubscriptions('', 'tok');
		await removeTokenFromAllSubscriptions('user-1', '');

		expect(mockGetDocs).not.toHaveBeenCalled();
	});
});
