import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import answerViews from '@/redux/answerViews/answerViewsSlice';
import statements, { setScopeFullyLoaded, setStatements } from '@/redux/statements/statementsSlice';
import { creatorSlice } from '@/redux/creator/creatorSlice';
import { RANKED_ANSWERS } from '@/constants/common';
import { Statement, StatementType } from '@freedi/shared-types';
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

function answer(id: string, overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statement: id,
		statementType: StatementType.option,
		parentId: QUESTION,
		creatorId: 'other',
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	} as Statement;
}

function question(numberOfOptions: number): Statement {
	return {
		statementId: QUESTION,
		statement: 'q',
		statementType: StatementType.question,
		parentId: 'top',
		createdAt: 1,
		lastUpdate: 1,
		numberOfOptions,
	} as Statement;
}

function makeStore(numberOfOptions = RANKED_ANSWERS.PAGE_SIZE + 10) {
	const store = configureStore({
		reducer: { statements, answerViews, creator: creatorSlice.reducer },
		preloadedState: { creator: { creator: { uid: 'me' } } } as never,
	});
	store.dispatch(setStatements([question(numberOfOptions)]));

	return store;
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

	it('does not cut a small question to the fetched page, so new answers show', async () => {
		mockFetch.mockResolvedValueOnce(page(['a'], false));
		const { result } = render(makeStore(5));
		await waitFor(() => expect(result.current.isTopLoaded).toBe(true));

		expect(result.current.rankedIds).toBeUndefined();
		expect(result.current.isListed(answer('later'))).toBe(true);
	});

	it('cuts a large question to the pages, but keeps what this person just added', async () => {
		mockFetch.mockResolvedValueOnce(page(['a']));
		const { result } = render(makeStore());
		await waitFor(() => expect(result.current.rankedIds).toBeDefined());

		expect(result.current.isListed(answer('a'))).toBe(true);
		expect(result.current.isListed(answer('elsewhere'))).toBe(false);
		expect(
			result.current.isListed(answer('mine', { creatorId: 'me', createdAt: Date.now() })),
		).toBe(true);
		expect(result.current.isListed(answer('old-mine', { creatorId: 'me', createdAt: 1 }))).toBe(
			false,
		);
	});

	it('refreshes the top page at most once a minute while the tab is visible', async () => {
		jest.useFakeTimers();
		try {
			mockFetch.mockResolvedValue(page(['a']));
			const { result } = render(makeStore());
			await act(async () => {
				await jest.advanceTimersByTimeAsync(0);
			});
			expect(result.current.rankedIds).toBeDefined();
			expect(mockFetch).toHaveBeenCalledTimes(1);

			await act(async () => {
				await jest.advanceTimersByTimeAsync(RANKED_ANSWERS.REFRESH_MS / 2);
			});
			expect(mockFetch).toHaveBeenCalledTimes(1);

			await act(async () => {
				await jest.advanceTimersByTimeAsync(RANKED_ANSWERS.REFRESH_MS);
			});
			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenLastCalledWith(QUESTION, undefined);
		} finally {
			jest.useRealTimers();
		}
	});

	it('does not refresh while the tab is hidden', async () => {
		jest.useFakeTimers();
		const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		try {
			mockFetch.mockResolvedValue(page(['a']));
			render(makeStore());
			await act(async () => {
				await jest.advanceTimersByTimeAsync(RANKED_ANSWERS.REFRESH_MS * 3);
			});

			expect(mockFetch).toHaveBeenCalledTimes(1);
		} finally {
			visibility.mockRestore();
			jest.useRealTimers();
		}
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
