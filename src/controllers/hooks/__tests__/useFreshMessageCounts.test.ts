import { renderHook } from '@testing-library/react';
import { useFreshMessageCounts, resetFreshMessageCountsCache } from '../useFreshMessageCounts';
import { CACHE } from '@/constants/common';
import { fetchMessageCounts } from '@/controllers/db/statements/fetchMessageCounts';

jest.mock('@/controllers/db/statements/fetchMessageCounts', () => ({
	fetchMessageCounts: jest.fn().mockResolvedValue(undefined),
}));

const mockFetch = fetchMessageCounts as jest.MockedFunction<typeof fetchMessageCounts>;

describe('useFreshMessageCounts', () => {
	beforeEach(() => {
		mockFetch.mockClear();
		resetFreshMessageCountsCache();
	});

	it('reads every shown card once', () => {
		renderHook(() => useFreshMessageCounts(['a', 'b']));

		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledWith(['a', 'b']);
	});

	it('reads only the cards that appear later (lazy loading), never again', () => {
		const { rerender } = renderHook(({ ids }) => useFreshMessageCounts(ids), {
			initialProps: { ids: ['a', 'b'] },
		});
		rerender({ ids: ['a', 'b'] });
		rerender({ ids: ['a', 'b', 'c'] });

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(mockFetch).toHaveBeenLastCalledWith(['c']);
	});

	it('does not read again on a quick return to Home (a new mount within the TTL)', () => {
		renderHook(() => useFreshMessageCounts(['a', 'b'])).unmount();
		renderHook(() => useFreshMessageCounts(['a', 'b']));

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('reads again after the TTL has passed', () => {
		jest.useFakeTimers();
		jest.setSystemTime(1_000_000);
		renderHook(() => useFreshMessageCounts(['a'])).unmount();
		jest.setSystemTime(1_000_000 + CACHE.SHORT_TTL + 1);
		renderHook(() => useFreshMessageCounts(['a']));
		jest.useRealTimers();

		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('reads nothing for an empty list', () => {
		renderHook(() => useFreshMessageCounts([]));

		expect(mockFetch).not.toHaveBeenCalled();
	});
});
