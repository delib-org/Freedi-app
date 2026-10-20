import type { QuerySnapshot } from 'firebase/firestore';

const mockDispatch = jest.fn();
const mockCollectionListener = jest.fn();
const mockDocumentListener = jest.fn();
const mockLegacyListener = jest.fn();
const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();

jest.mock('@/redux/store', () => ({
	store: { dispatch: (action: unknown) => mockDispatch(action) },
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createCollectionRef: jest.fn((name: string) => ({ name })),
	createSubscriptionRef: jest.fn((id: string) => ({ id })),
}));
jest.mock('firebase/firestore', () => ({
	query: jest.fn((...parts: unknown[]) => ({ parts })),
	where: jest.fn((...args: unknown[]) => ({ where: args })),
	orderBy: jest.fn((...args: unknown[]) => ({ orderBy: args })),
	limit: jest.fn((n: number) => ({ limit: n })),
	startAfter: jest.fn((value: unknown) => ({ startAfter: value })),
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));
jest.mock('@/controllers/utils/firestoreListenerHelpers', () => ({
	createManagedCollectionListener: (...args: unknown[]) => mockCollectionListener(...args),
	createManagedDocumentListener: (...args: unknown[]) => mockDocumentListener(...args),
	generateListenerKey: (...parts: string[]) => parts.join('-'),
}));
jest.mock('@/controllers/db/subscriptions/getSubscriptions', () => ({
	listenToStatementSubscriptions: (...args: unknown[]) => mockLegacyListener(...args),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

import { fetchOlderUserFeed, listenToUserFeed } from '../listenToUserFeed';

type Change = {
	type: 'added' | 'modified' | 'removed';
	doc: { data: () => Record<string, unknown> };
};

function feedDoc(statementId: string, lastActivity: number) {
	const data = {
		feedId: `alice--${statementId}`,
		userId: 'alice',
		statementId,
		subscriptionId: `alice--${statementId}`,
		lastActivity,
		createdAt: 1,
	};

	return { data: () => data };
}

function snapshot(docs: ReturnType<typeof feedDoc>[], changes: Change[] = []): QuerySnapshot {
	return {
		empty: docs.length === 0,
		docs,
		size: docs.length,
		docChanges: () => changes,
	} as unknown as QuerySnapshot;
}

function feedHandler(): (snap: QuerySnapshot) => void {
	return mockCollectionListener.mock.calls[0][2] as (snap: QuerySnapshot) => void;
}

describe('listenToUserFeed', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCollectionListener.mockReturnValue(jest.fn());
		mockDocumentListener.mockImplementation(() => jest.fn());
		mockLegacyListener.mockReturnValue(jest.fn());
	});

	it('listens to the first page of the feed, ordered by activity, limited to the page size', () => {
		listenToUserFeed('alice', 30);

		const queryArg = JSON.stringify(mockCollectionListener.mock.calls[0][0]);
		expect(queryArg).toContain('"lastActivity","desc"');
		expect(queryArg).toContain('"limit":30');
		expect(queryArg).toContain('"userId","==","alice"');
	});

	it('reads only the subscriptions on the page, one doc listener each, never twice', () => {
		listenToUserFeed('alice', 30);
		feedHandler()(snapshot([feedDoc('a', 3), feedDoc('b', 2)]));
		feedHandler()(snapshot([feedDoc('b', 4), feedDoc('a', 3)]));

		expect(mockDocumentListener).toHaveBeenCalledTimes(2);
		expect(mockLegacyListener).not.toHaveBeenCalled();
	});

	it('stops listening to a subscription that falls off the first page', () => {
		const stopB = jest.fn();
		mockDocumentListener.mockImplementation((ref: { id: string }) =>
			ref.id === 'alice--b' ? stopB : jest.fn(),
		);
		listenToUserFeed('alice', 30);
		feedHandler()(snapshot([feedDoc('a', 3), feedDoc('b', 2)]));
		feedHandler()(snapshot([feedDoc('a', 3)], [{ type: 'removed', doc: feedDoc('b', 2) }]));

		expect(stopB).toHaveBeenCalled();
	});

	it('stops the legacy fallback as soon as the feed gets entries, and never restarts it', () => {
		const stopLegacy = jest.fn();
		mockLegacyListener.mockReturnValue(stopLegacy);
		listenToUserFeed('alice', 30);

		feedHandler()(snapshot([])); // not yet backfilled → fallback starts
		expect(mockLegacyListener).toHaveBeenCalledTimes(1);
		expect(stopLegacy).not.toHaveBeenCalled();

		feedHandler()(snapshot([feedDoc('a', 3)])); // backfill / first join landed
		expect(stopLegacy).toHaveBeenCalledTimes(1);
		expect(mockDocumentListener).toHaveBeenCalledTimes(1);

		feedHandler()(snapshot([])); // feed emptied later (left the last discussion)
		feedHandler()(snapshot([feedDoc('b', 4)]));
		expect(mockLegacyListener).toHaveBeenCalledTimes(1);
		expect(stopLegacy).toHaveBeenCalledTimes(1);
	});

	it('does not stop the legacy listener twice on cleanup after the switch', () => {
		const stopLegacy = jest.fn();
		mockLegacyListener.mockReturnValue(stopLegacy);
		const unsubscribe = listenToUserFeed('alice', 30);
		feedHandler()(snapshot([]));
		feedHandler()(snapshot([feedDoc('a', 3)]));
		unsubscribe();

		expect(stopLegacy).toHaveBeenCalledTimes(1);
	});

	it('falls back to the legacy subscription listener for a user with no feed yet', () => {
		listenToUserFeed('alice', 30);
		feedHandler()(snapshot([]));

		expect(mockLegacyListener).toHaveBeenCalledWith('alice', 30);
	});

	it('cleans every listener up', () => {
		const stopFeed = jest.fn();
		const stopDoc = jest.fn();
		mockCollectionListener.mockReturnValue(stopFeed);
		mockDocumentListener.mockImplementation(() => stopDoc);
		const unsubscribe = listenToUserFeed('alice', 30);
		feedHandler()(snapshot([feedDoc('a', 3)]));
		unsubscribe();

		expect(stopFeed).toHaveBeenCalled();
		expect(stopDoc).toHaveBeenCalled();
	});
});

describe('fetchOlderUserFeed', () => {
	beforeEach(() => jest.clearAllMocks());

	it('fetches batch+1 feed docs after the cursor and exactly batch subscriptions', async () => {
		const docs = [feedDoc('c', 5), feedDoc('d', 4), feedDoc('e', 3)];
		mockGetDocs.mockResolvedValue(snapshot(docs));
		mockGetDoc.mockResolvedValue({ exists: () => false });

		const result = await fetchOlderUserFeed('alice', 6, 2);

		expect(result.hasMore).toBe(true);
		expect(mockGetDoc).toHaveBeenCalledTimes(2);
		const queryArg = JSON.stringify(mockGetDocs.mock.calls[0][0]);
		expect(queryArg).toContain('"startAfter":6');
		expect(queryArg).toContain('"limit":3');
	});
});
