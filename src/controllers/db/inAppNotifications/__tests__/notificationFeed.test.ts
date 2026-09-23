import {
	listenToInAppNotifications,
	markMultipleNotificationsAsReadDB,
} from '../db_inAppNotifications';
import { store } from '@/redux/store';
import { writeBatch } from 'firebase/firestore';

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
	onSnapshot: (_query: unknown, callback: (snapshot: Snapshot) => void) => {
		listeners.push(callback);

		return unsubscribe;
	},
	doc: jest.fn(),
	writeBatch: jest.fn(() => ({ update, commit })),
}));
function snapshot(records: RecordData[]): Snapshot {
	return { docs: records.map((record) => ({ id: record.notificationId, data: () => record })) };
}
beforeEach(() => {
	currentUser = 'one';
	listeners.length = 0;
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
