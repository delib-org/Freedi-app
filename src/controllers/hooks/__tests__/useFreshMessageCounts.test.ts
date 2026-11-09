import { renderHook } from '@testing-library/react';
import { useFreshMessageCounts } from '../useFreshMessageCounts';
import { fetchMessageCounts } from '@/controllers/db/statements/fetchMessageCounts';

jest.mock('@/controllers/db/statements/fetchMessageCounts', () => ({
	fetchMessageCounts: jest.fn().mockResolvedValue(undefined),
}));

const mockFetch = fetchMessageCounts as jest.MockedFunction<typeof fetchMessageCounts>;

describe('useFreshMessageCounts', () => {
	beforeEach(() => {
		mockFetch.mockClear();
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

	it('reads nothing for an empty list', () => {
		renderHook(() => useFreshMessageCounts([]));

		expect(mockFetch).not.toHaveBeenCalled();
	});
});
