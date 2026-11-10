import { doc, onSnapshot } from 'firebase/firestore';
import { store } from '@/redux/store';
import { listenToUserEngagement } from '../db_engagement';

jest.mock('firebase/firestore', () => ({
	collection: jest.fn(),
	doc: jest.fn((_db: unknown, _collection: string, id: string) => ({ id })),
	onSnapshot: jest.fn(),
	orderBy: jest.fn(),
	query: jest.fn(),
	limit: jest.fn(),
	where: jest.fn(),
}));
jest.mock('../../config', () => ({ DB: {} }));
jest.mock('@/redux/engagement/engagementSlice', () => ({
	setUserEngagement: jest.fn(),
	setRecentCredits: jest.fn(),
	setEngagementLoading: jest.fn(),
	clearEngagement: jest.fn(),
}));
jest.mock('@/redux/store', () => ({
	store: { getState: jest.fn(), dispatch: jest.fn() },
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const firestoreUnsubscribe = jest.fn();

function signInAs(uid: string | null): void {
	(store.getState as jest.Mock).mockReturnValue({
		creator: { creator: uid ? { uid } : null },
	});
}

describe('listenToUserEngagement', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(onSnapshot as jest.Mock).mockReturnValue(firestoreUnsubscribe);
		signInAs('u1');
	});

	it('opens one Firestore listener for two holders', () => {
		const releaseFirst = listenToUserEngagement();
		const releaseSecond = listenToUserEngagement();

		expect(onSnapshot).toHaveBeenCalledTimes(1);

		releaseFirst();
		releaseSecond();
	});

	it('keeps the listener until the last holder releases it', () => {
		const releaseFirst = listenToUserEngagement();
		const releaseSecond = listenToUserEngagement();

		releaseFirst();
		expect(firestoreUnsubscribe).not.toHaveBeenCalled();

		releaseSecond();
		expect(firestoreUnsubscribe).toHaveBeenCalledTimes(1);
	});

	it('ignores a release called twice by the same holder', () => {
		const releaseFirst = listenToUserEngagement();
		const releaseSecond = listenToUserEngagement();

		releaseFirst();
		releaseFirst();
		expect(firestoreUnsubscribe).not.toHaveBeenCalled();

		releaseSecond();
	});

	it('opens a new listener after the last one was released', () => {
		listenToUserEngagement()();
		const release = listenToUserEngagement();

		expect(onSnapshot).toHaveBeenCalledTimes(2);

		release();
	});

	it('listens separately for a different user', () => {
		const releaseFirst = listenToUserEngagement();
		signInAs('u2');
		const releaseSecond = listenToUserEngagement();

		expect(onSnapshot).toHaveBeenCalledTimes(2);
		expect(doc).toHaveBeenLastCalledWith({}, expect.any(String), 'u2');

		releaseFirst();
		releaseSecond();
	});

	it('does not listen without a signed-in user', () => {
		signInAs(null);
		listenToUserEngagement()();

		expect(onSnapshot).not.toHaveBeenCalled();
	});
});
