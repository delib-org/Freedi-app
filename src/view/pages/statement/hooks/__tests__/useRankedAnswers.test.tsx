import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import answerViews from '@/redux/answerViews/answerViewsSlice';
import statements, { setScopeFullyLoaded } from '@/redux/statements/statementsSlice';
import { fetchTopAnswers, TopAnswersPage } from '@/controllers/db/statements/topAnswers';
import { useRankedAnswers } from '../useRankedAnswers';

jest.mock('@/controllers/db/statements/topAnswers', () => ({ fetchTopAnswers: jest.fn() }));
jest.mock('@/utils/errorHandling', () => ({
	...jest.requireActual('@/utils/errorHandling'),
	logError: jest.fn(),
}));

const QUESTION = 'q';
const mockFetch = fetchTopAnswers as jest.MockedFunction<typeof fetchTopAnswers>;

function page(ids: string[], hasMore = true): TopAnswersPage {
	return { ids, hasMore, cursor: { consensus: 0.5, statementId: ids[ids.length - 1] } };
}

function makeStore() {
	return configureStore({ reducer: { statements, answerViews } });
}

function render(store: ReturnType<typeof makeStore>, enabled = true) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<Provider store={store}>{children}</Provider>
	);

	return renderHook(
		({ isEnabled }: { isEnabled: boolean }) => useRankedAnswers(QUESTION, isEnabled),
		{ initialProps: { isEnabled: enabled }, wrapper },
	);
}

describe('useRankedAnswers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not query while the reader may not see a ranking', () => {
		const { result } = render(makeStore(), false);

		expect(mockFetch).not.toHaveBeenCalled();
		expect(result.current.rankedIds).toBeUndefined();
	});

	it('fetches the first page once', async () => {
		mockFetch.mockResolvedValueOnce(page(['a', 'b']));
		const { result } = render(makeStore());

		await waitFor(() => expect(result.current.rankedIds).toEqual(new Set(['a', 'b'])));
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledWith(QUESTION, undefined);
	});

	it('pages from the cursor of the last page', async () => {
		mockFetch.mockResolvedValueOnce(page(['a', 'b']));
		const { result } = render(makeStore());
		await waitFor(() => expect(result.current.hasMore).toBe(true));

		mockFetch.mockResolvedValueOnce(page(['c'], false));
		act(() => result.current.loadMore());

		await waitFor(() => expect(result.current.rankedIds).toEqual(new Set(['a', 'b', 'c'])));
		expect(mockFetch).toHaveBeenLastCalledWith(QUESTION, { consensus: 0.5, statementId: 'b' });
		expect(result.current.hasMore).toBe(false);
	});

	it('steps aside once every answer is loaded', async () => {
		mockFetch.mockResolvedValueOnce(page(['a']));
		const store = makeStore();
		const { result } = render(store);
		await waitFor(() => expect(result.current.rankedIds).toBeDefined());

		act(() => {
			store.dispatch(setScopeFullyLoaded({ rootId: QUESTION, mode: 'direct', watermark: 1 }));
		});

		expect(result.current.rankedIds).toBeUndefined();
		expect(result.current.hasMore).toBe(false);
	});

	it('keeps the whole list and does not retry when the query fails', async () => {
		mockFetch.mockRejectedValueOnce(new Error('index'));
		const { result, rerender } = render(makeStore());
		await waitFor(() => expect(result.current.isLoading).toBe(false));

		rerender({ isEnabled: true });

		expect(result.current.rankedIds).toBeUndefined();
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
