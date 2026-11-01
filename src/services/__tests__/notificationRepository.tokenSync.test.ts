/**
 * Tests for syncTokenWithSubscriptions: only subscriptions missing the token are written,
 * and a per-device marker avoids re-syncing the same token for the same user.
 */

const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn(() => Promise.resolve());
const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
	setDoc: jest.fn(),
	doc: jest.fn(),
	deleteDoc: jest.fn(),
	getDoc: jest.fn(),
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	query: jest.fn(() => ({})),
	where: jest.fn(),
	collection: jest.fn(),
	writeBatch: jest.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
	Timestamp: { now: jest.fn() },
	arrayUnion: jest.fn((value: string) => ({ arrayUnion: value })),
}));

jest.mock('@/controllers/db/config', () => ({
	DB: {},
	auth: { currentUser: { uid: 'user-1' } },
}));

jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	removeTokenFromSubscription: jest.fn(() => Promise.resolve()),
	addTokenToSubscription: jest.fn(() => Promise.resolve()),
}));

jest.mock('../platformService', () => ({
	getDeviceInfo: jest.fn(),
}));

import {
	syncTokenWithSubscriptions,
	removeTokenFromAllSubscriptions,
} from '../notificationRepository';
import { NOTIFICATION, STORAGE_KEYS } from '@/constants/common';

interface FakeSubscription {
	ref: { id: string };
	data: () => { statementId: string; tokens?: string[] };
}

interface StoredMarker {
	userId: string;
	token: string;
	syncedAt: number;
}

const sub = (id: string, tokens?: string[]): FakeSubscription => ({
	ref: { id },
	data: () => ({ statementId: `st-${id}`, tokens }),
});

const mockSubscriptions = (...docs: FakeSubscription[]): void => {
	mockGetDocs.mockResolvedValue({ docs });
};

const storeMarker = (marker: StoredMarker): void => {
	localStorage.setItem(STORAGE_KEYS.FCM_TOKEN_SYNC, JSON.stringify(marker));
};

const readMarker = (): StoredMarker | null => {
	const raw = localStorage.getItem(STORAGE_KEYS.FCM_TOKEN_SYNC);

	return raw ? (JSON.parse(raw) as StoredMarker) : null;
};

describe('syncTokenWithSubscriptions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
	});

	it('does not write a subscription that already has the token', async () => {
		mockSubscriptions(sub('a', ['tok']));

		const written = await syncTokenWithSubscriptions('user-1', 'tok');

		expect(written).toBe(0);
		expect(mockBatchUpdate).not.toHaveBeenCalled();
		expect(mockBatchCommit).not.toHaveBeenCalled();
	});

	it('writes subscriptions missing the token', async () => {
		mockSubscriptions(sub('a', ['other']), sub('b'));

		const written = await syncTokenWithSubscriptions('user-1', 'tok');

		expect(written).toBe(2);
		expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
		const data = mockBatchUpdate.mock.calls[0][1] as Record<string, unknown>;
		expect(data.tokens).toEqual({ arrayUnion: 'tok' });
		expect(typeof data.lastTokenUpdate).toBe('number');
	});

	it('writes only the missing ones in a mixed batch', async () => {
		mockSubscriptions(sub('a', ['tok']), sub('b', []), sub('c', ['x', 'tok']), sub('d', ['x']));

		const written = await syncTokenWithSubscriptions('user-1', 'tok');

		expect(written).toBe(2);
		const ids = mockBatchUpdate.mock.calls.map((call) => (call[0] as { id: string }).id);
		expect(ids).toEqual(['b', 'd']);
	});

	it('records the marker after a successful sync and then skips the query', async () => {
		mockSubscriptions(sub('a'));
		await syncTokenWithSubscriptions('user-1', 'tok');

		expect(readMarker()).toMatchObject({ userId: 'user-1', token: 'tok' });

		mockGetDocs.mockClear();
		const written = await syncTokenWithSubscriptions('user-1', 'tok');

		expect(written).toBe(0);
		expect(mockGetDocs).not.toHaveBeenCalled();
	});

	it('does not record the marker when the sync fails', async () => {
		mockSubscriptions(sub('a'));
		mockBatchCommit.mockRejectedValueOnce(new Error('boom'));

		await expect(syncTokenWithSubscriptions('user-1', 'tok')).rejects.toThrow('boom');

		expect(readMarker()).toBeNull();
	});

	it('syncs again when the token changed', async () => {
		mockSubscriptions(sub('a', ['tok']));
		await syncTokenWithSubscriptions('user-1', 'tok');
		mockGetDocs.mockClear();
		mockSubscriptions(sub('a', ['tok']));

		await syncTokenWithSubscriptions('user-1', 'tok-2');

		expect(mockGetDocs).toHaveBeenCalledTimes(1);
		expect(readMarker()?.token).toBe('tok-2');
	});

	it('syncs again for a different user', async () => {
		storeMarker({ userId: 'user-0', token: 'tok', syncedAt: Date.now() });
		mockSubscriptions();

		await syncTokenWithSubscriptions('user-1', 'tok');

		expect(mockGetDocs).toHaveBeenCalledTimes(1);
	});

	it('syncs again once the resync interval has passed', async () => {
		storeMarker({
			userId: 'user-1',
			token: 'tok',
			syncedAt: Date.now() - NOTIFICATION.TOKEN_RESYNC_INTERVAL - 1,
		});
		mockSubscriptions();

		await syncTokenWithSubscriptions('user-1', 'tok');

		expect(mockGetDocs).toHaveBeenCalledTimes(1);
	});

	it('still syncs when storage throws', async () => {
		const getSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		const setSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('denied');
		});
		mockSubscriptions(sub('a'));

		const written = await syncTokenWithSubscriptions('user-1', 'tok');

		expect(written).toBe(1);
		getSpy.mockRestore();
		setSpy.mockRestore();
	});

	it('clears the marker on token removal', async () => {
		storeMarker({ userId: 'user-1', token: 'tok', syncedAt: Date.now() });
		mockSubscriptions();

		await removeTokenFromAllSubscriptions('user-1', 'tok');

		expect(readMarker()).toBeNull();
	});
});
