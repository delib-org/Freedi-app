import {
	listenToInAppNotifications,
	markAllUnreadNotificationsAsReadDB,
	markMultipleNotificationsAsReadDB,
	markStatementNotificationsAsReadDB,
} from '../db_inAppNotifications';
import { store } from '@/redux/store';
import { getDocs, limit, orderBy, where, writeBatch } from 'firebase/firestore';
import { NOTIFICATION } from '@/constants/common';

interface RecordData {
	notificationId: string;
	read: boolean;
	createdAt: number;
}
interface Snapshot {
	docs: { id: string; data: () => RecordData }[];
}
let currentUser = 'one';
const listeners: ((snapshot: Snapshot) => void)[] = [];
const errorListeners: ((error: { code: string }) => void)[] = [];
const unsubscribe = jest.fn();
const update = jest.fn();
const commit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/redux/store', () => ({
	store: { getState: () => ({ creator: { creator: { uid: currentUser } } }), dispatch: jest.fn() },
}));
jest.mock('../../config', () => ({ DB: {} }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('firebase/firestore', () => ({
	collection: jest.fn(),
	where: jest.fn(),
	orderBy: jest.fn(),
	limit: jest.fn(),
	query: jest.fn(),
	onSnapshot: (
		_query: unknown,
		callback: (snapshot: Snapshot) => void,
		onError: (error: { code: string }) => void,
	) => {
		listeners.push(callback);
		errorListeners.push(onError);

		return unsubscribe;
	},
	doc: jest.fn(),
	getDocs: jest.fn(),
	writeBatch: jest.fn(() => ({ update, commit })),
}));
function snapshot(records: RecordData[]): Snapshot {
	return { docs: records.map((record) => ({ id: record.notificationId, data: () => record })) };
}
beforeEach(() => {
	currentUser = 'one';
	listeners.length = 0;
	errorListeners.length = 0;
	jest.clearAllMocks();
});
it('waits for both snapshots and includes old unread records beyond recent history', () => {
	listenToInAppNotifications();
	listeners[0](snapshot([{ notificationId: 'recent', read: true, createdAt: 10 }]));
	expect(store.dispatch).not.toHaveBeenCalled();
	listeners[1](snapshot([{ notificationId: 'old', read: false, createdAt: 1 }]));
	expect(store.dispatch).toHaveBeenCalledWith(
		expect.objectContaining({
			type: 'notifications/setInAppNotificationsAll',
			payload: [
				{ notificationId: 'recent', read: true, createdAt: 10, readAt: undefined },
				{ notificationId: 'old', read: false, createdAt: 1, readAt: undefined },
			],
		}),
	);
	expect(store.dispatch).toHaveBeenCalledWith(
		expect.objectContaining({ type: 'notifications/setNotificationFeedOwner', payload: 'one' }),
	);
});
it('ignores a late callback from the previous user and unsubscribes both feeds', () => {
	const stop = listenToInAppNotifications();
	currentUser = 'two';
	listeners[0](snapshot([]));
	listeners[1](snapshot([]));
	expect(store.dispatch).not.toHaveBeenCalled();
	stop();
	expect(unsubscribe).toHaveBeenCalledTimes(2);
});
it('marks large unread inboxes in batches below the write limit', async () => {
	const ids = Array.from({ length: 901 }, (_, index) => String(index));
	await markMultipleNotificationsAsReadDB([...ids, '0']);
	expect(writeBatch).toHaveBeenCalledTimes(3);
	expect(update).toHaveBeenCalledTimes(901);
	expect(commit).toHaveBeenCalledTimes(3);
	expect(store.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ payload: ['900'] }));
});
it('bounds the unread listener so its download cannot grow with the backlog', () => {
	(limit as jest.Mock).mockImplementation((value: number) => ({ limit: value }));
	(where as jest.Mock).mockImplementation((field: string) => ({ field }));
	const { query } = jest.requireMock('firebase/firestore') as { query: jest.Mock };

	listenToInAppNotifications();

	const unreadQuery = query.mock.calls.find((call) =>
		call.some((part: { field?: string }) => part?.field === 'read'),
	);
	expect(unreadQuery).toContainEqual({ limit: NOTIFICATION.UNREAD_LISTENER_LIMIT });
});
describe('when the unread index is not ready', () => {
	const recent = { notificationId: 'recent', read: true, createdAt: 10 };
	const missingIndex = { code: 'failed-precondition' };
	const dispatchedTypes = () =>
		(store.dispatch as unknown as jest.Mock).mock.calls.map(([action]) => action.type);

	it('still shows the history and sets the owner, when the error comes last', () => {
		listenToInAppNotifications();
		listeners[0](snapshot([recent]));
		errorListeners[1](missingIndex);

		expect(store.dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'notifications/setInAppNotificationsAll',
				payload: [expect.objectContaining({ notificationId: 'recent' })],
			}),
		);
		expect(dispatchedTypes()).toContain('notifications/setNotificationFeedOwner');
	});

	it('still shows the history when the error comes first', () => {
		listenToInAppNotifications();
		errorListeners[1](missingIndex);
		expect(store.dispatch).not.toHaveBeenCalled();
		listeners[0](snapshot([recent]));

		expect(dispatchedTypes()).toContain('notifications/setNotificationFeedOwner');
	});

	it('does not publish on a permission error during sign-out', () => {
		listenToInAppNotifications();
		listeners[0](snapshot([recent]));
		errorListeners[1]({ code: 'permission-denied' });

		expect(store.dispatch).not.toHaveBeenCalled();
	});
});
it('orders the unread listener newest first', () => {
	(orderBy as jest.Mock).mockImplementation((field: string, direction: string) => ({
		order: `${field} ${direction}`,
	}));
	(where as jest.Mock).mockImplementation((field: string) => ({ field }));
	const { query } = jest.requireMock('firebase/firestore') as { query: jest.Mock };

	listenToInAppNotifications();

	const unreadQuery = query.mock.calls.find((call) =>
		call.some((part: { field?: string }) => part?.field === 'read'),
	);
	expect(unreadQuery).toContainEqual({ order: 'createdAt desc' });
});
describe('markAllUnreadNotificationsAsReadDB', () => {
	function page(size: number): { empty: boolean; size: number; docs: { ref: string }[] } {
		return {
			empty: size === 0,
			size,
			docs: Array.from({ length: size }, (_, i) => ({ ref: `n${i}` })),
		};
	}

	it('pages through the whole server backlog, not only what is loaded', async () => {
		const size = NOTIFICATION.MARK_READ_BATCH_SIZE;
		(getDocs as jest.Mock)
			.mockResolvedValueOnce(page(size))
			.mockResolvedValueOnce(page(size))
			.mockResolvedValueOnce(page(100));

		await markAllUnreadNotificationsAsReadDB();

		expect(getDocs).toHaveBeenCalledTimes(3);
		expect(commit).toHaveBeenCalledTimes(3);
		expect(update).toHaveBeenCalledTimes(size * 2 + 100);
	});

	it('stops when a full page turns out to be the last', async () => {
		(getDocs as jest.Mock)
			.mockResolvedValueOnce(page(NOTIFICATION.MARK_READ_BATCH_SIZE))
			.mockResolvedValueOnce(page(0));

		await markAllUnreadNotificationsAsReadDB();

		expect(commit).toHaveBeenCalledTimes(1);
	});

	it('does nothing when nothing is unread', async () => {
		(getDocs as jest.Mock).mockResolvedValueOnce(page(0));

		await markAllUnreadNotificationsAsReadDB();

		expect(commit).not.toHaveBeenCalled();
	});
});
describe('markStatementNotificationsAsReadDB', () => {
	it('clears a whole question from a query, in batches under the write limit', async () => {
		const total = NOTIFICATION.MARK_READ_BATCH_SIZE + 10;
		const docs = Array.from({ length: total }, (_, i) => ({ ref: `n${i}` }));
		(getDocs as jest.Mock).mockResolvedValueOnce({ empty: false, docs });

		await markStatementNotificationsAsReadDB('question');

		expect(commit).toHaveBeenCalledTimes(2);
		expect(update).toHaveBeenCalledTimes(total);
	});
});
it('fetches enough unread records for the badge to reach its cap', () => {
	expect(NOTIFICATION.UNREAD_LISTENER_LIMIT).toBeGreaterThan(NOTIFICATION.UNREAD_DISPLAY_MAX);
});
