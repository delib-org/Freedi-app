import { limit, onSnapshot } from 'firebase/firestore';
import { Online } from '@freedi/shared-types';
import { PRESENCE } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { ListenToOnlineUsers } from '../getOnline';

jest.mock('firebase/firestore', () => ({
	query: jest.fn(() => 'the-query'),
	where: jest.fn(),
	limit: jest.fn(),
	onSnapshot: jest.fn(() => jest.fn()),
}));
jest.mock('@/utils/firebaseUtils', () => ({ createCollectionRef: jest.fn() }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockOnSnapshot = onSnapshot as jest.Mock;
const NOW = 5_000_000;

function snapshotOf(lastUpdatedValues: number[]) {
	return {
		forEach: (visit: (doc: { data: () => Partial<Online> }) => void) => {
			lastUpdatedValues.forEach((lastUpdated) => visit({ data: () => ({ lastUpdated }) }));
		},
	};
}

describe('ListenToOnlineUsers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(Date, 'now').mockReturnValue(NOW);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('caps how many people one listener can hold', () => {
		ListenToOnlineUsers('q1', jest.fn());

		expect(limit).toHaveBeenCalledWith(PRESENCE.MAX_LISTENED_PEOPLE);
		expect(mockOnSnapshot.mock.calls[0][0]).toBe('the-query');
	});

	it('does not listen without a statement', () => {
		ListenToOnlineUsers('', jest.fn());

		expect(mockOnSnapshot).not.toHaveBeenCalled();
	});

	it('drops people who have gone stale', () => {
		const setUsers = jest.fn();
		ListenToOnlineUsers('q1', setUsers);
		const onNext = mockOnSnapshot.mock.calls[0][1];

		onNext(snapshotOf([NOW - 1, NOW - PRESENCE.STALE_AFTER_MS]));

		expect(setUsers).toHaveBeenCalledTimes(1);
		expect(setUsers.mock.calls[0][0]).toHaveLength(1);
	});

	it('logs a listener failure and stops the loading state', () => {
		const setLoading = jest.fn();
		ListenToOnlineUsers('q1', jest.fn(), setLoading);
		const onError = mockOnSnapshot.mock.calls[0][2];
		const failure = new Error('denied');

		onError(failure);

		expect(logError).toHaveBeenCalledWith(failure, {
			operation: 'online.getOnline.listen',
			statementId: 'q1',
		});
		expect(setLoading).toHaveBeenCalledWith(false);
	});
});
