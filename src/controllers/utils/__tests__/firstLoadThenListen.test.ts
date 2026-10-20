import type { Query, QueryDocumentSnapshot, QuerySnapshot } from 'firebase/firestore';
import { firstLoadThenListen } from '../firstLoadThenListen';

const mockGetDocs = jest.fn();
const mockLimit = jest.fn((n: number) => ({ limitN: n }));
const mockQuery = jest.fn((q: unknown, ...rest: unknown[]) => ({ q, rest }));

jest.mock('firebase/firestore', () => ({
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	limit: (n: number) => mockLimit(n),
	query: (q: unknown, ...rest: unknown[]) => mockQuery(q, ...rest),
}));

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockSubscribe = jest.fn();
jest.mock('../subscribeWhenAuthenticated', () => ({
	subscribeWhenAuthenticated: (fn: () => () => void) => mockSubscribe(fn),
}));

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const queryRef = {} as Query;
const liveSnapshot = {} as QuerySnapshot;

function setup(onFirstDocs = jest.fn(), onSnapshotNext = jest.fn()) {
	const handle = firstLoadThenListen({
		queryRef,
		onFirstDocs,
		onSnapshotNext,
		operation: 'test.op',
	});

	return { handle, onFirstDocs, onSnapshotNext };
}

describe('firstLoadThenListen', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscribe.mockImplementation((fn: () => () => void) => {
			fn();

			return jest.fn();
		});
	});

	it('reads the first 10 with the same query and hands them over', async () => {
		const docs = [{ id: 'a' }] as unknown as QueryDocumentSnapshot[];
		mockGetDocs.mockResolvedValue({ empty: false, docs });
		const { onFirstDocs } = setup();
		await flush();

		expect(mockLimit).toHaveBeenCalledWith(10);
		expect(mockQuery).toHaveBeenCalledWith(queryRef, { limitN: 10 });
		expect(onFirstDocs).toHaveBeenCalledWith(docs);
	});

	it('drops the first page if the live snapshot arrived first', async () => {
		let resolve: (v: unknown) => void = () => {};
		mockGetDocs.mockReturnValue(new Promise((r) => (resolve = r)));
		const { handle, onFirstDocs, onSnapshotNext } = setup();

		handle.onNext(liveSnapshot);
		resolve({ empty: false, docs: [{}] });
		await flush();

		expect(onSnapshotNext).toHaveBeenCalledWith(liveSnapshot);
		expect(onFirstDocs).not.toHaveBeenCalled();
	});

	it('drops the first page after cancel and stops the auth wait', async () => {
		const stop = jest.fn();
		mockSubscribe.mockImplementation((fn: () => () => void) => {
			fn();

			return stop;
		});
		mockGetDocs.mockResolvedValue({ empty: false, docs: [{}] });
		const { handle, onFirstDocs } = setup();

		handle.cancel();
		await flush();

		expect(stop).toHaveBeenCalled();
		expect(onFirstDocs).not.toHaveBeenCalled();
	});

	it('ignores an empty first page', async () => {
		mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
		const { onFirstDocs } = setup();
		await flush();

		expect(onFirstDocs).not.toHaveBeenCalled();
	});

	it('swallows a failed read so the live listener carries on', async () => {
		mockGetDocs.mockRejectedValue(new Error('offline'));
		const { handle, onSnapshotNext } = setup();
		await flush();
		handle.onNext(liveSnapshot);

		expect(onSnapshotNext).toHaveBeenCalledTimes(1);
	});
});
