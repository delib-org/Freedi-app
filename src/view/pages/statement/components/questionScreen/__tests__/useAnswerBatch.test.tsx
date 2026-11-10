import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { Evaluation, Statement, StatementType } from '@freedi/shared-types';
import statements, { setStatements } from '@/redux/statements/statementsSlice';
import evaluations, { setEvaluationToStore } from '@/redux/evaluations/evaluationsSlice';
import { creatorSlice } from '@/redux/creator/creatorSlice';
import answerViews, {
	moreToRateSelector,
	rateBatchSelector,
	recordRateBatchFailure,
	setRateBatch,
} from '@/redux/answerViews/answerViewsSlice';
import { RATE_VIEW } from '@/constants/common';
import {
	AnswerBatchPage,
	fetchAnswerBatch,
	listenToBatchAnswers,
} from '@/controllers/db/statements/answerBatch';
import { useAnswerBatch } from '../useAnswerBatch';

jest.mock('@/controllers/db/statements/answerBatch', () => ({
	fetchAnswerBatch: jest.fn(),
	listenToBatchAnswers: jest.fn(() => jest.fn()),
}));
jest.mock('@/utils/errorHandling', () => ({
	...jest.requireActual('@/utils/errorHandling'),
	logError: jest.fn(),
}));

const QUESTION = 'q';
const UID = 'me';
const mockFetch = fetchAnswerBatch as jest.MockedFunction<typeof fetchAnswerBatch>;
const mockListen = listenToBatchAnswers as jest.Mock;

function answer(id: string): Statement {
	return {
		statementId: id,
		statement: id,
		statementType: StatementType.option,
		parentId: QUESTION,
		topParentId: QUESTION,
		creatorId: 'other',
		creator: { uid: 'other', displayName: 'o' },
		consensus: 0,
		createdAt: 1,
		lastUpdate: 1,
		parents: [QUESTION],
	} as Statement;
}

function page(ids: string[], overrides: Partial<AnswerBatchPage> = {}): AnswerBatchPage {
	return { ids, hasMore: true, remaining: 10, totalAnswers: 40, ...overrides };
}

function makeStore() {
	const store = configureStore({
		reducer: { statements, evaluations, creator: creatorSlice.reducer, answerViews },
		preloadedState: {
			creator: { creator: { uid: UID }, language: 'en' },
		} as never,
	});
	store.dispatch(setStatements(['a1', 'a2', 'a3', 'a4'].map(answer)));

	return store;
}

function rate(store: ReturnType<typeof makeStore>, id: string): void {
	store.dispatch(
		setEvaluationToStore({
			evaluationId: `${UID}--${id}`,
			statementId: id,
			parentId: QUESTION,
			evaluatorId: UID,
			evaluation: 1,
			updatedAt: 2,
		} as Evaluation),
	);
}

function renderBatch(store: ReturnType<typeof makeStore>, active = true) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<Provider store={store}>{children}</Provider>
	);

	return renderHook(
		({ isActive, count = 40 }: { isActive: boolean; count?: number }) =>
			useAnswerBatch(QUESTION, isActive, count),
		{ initialProps: { isActive: active } as { isActive: boolean; count?: number }, wrapper },
	);
}

function ids(list: Statement[]): string[] {
	return list.map((statement) => statement.statementId);
}

describe('useAnswerBatch', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not ask for anything while the view is off', () => {
		renderBatch(makeStore(), false);

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('shows the first batch', async () => {
		mockFetch.mockResolvedValueOnce(page(['a1', 'a2']));
		const { result } = renderBatch(makeStore());

		await waitFor(() => expect(ids(result.current.answers)).toEqual(['a1', 'a2']));
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('asks for the next batch only when the whole batch is rated', async () => {
		mockFetch.mockResolvedValueOnce(page(['a1', 'a2']));
		const store = makeStore();
		const { result } = renderBatch(store);
		await waitFor(() => expect(result.current.answers).toHaveLength(2));

		mockFetch.mockResolvedValueOnce(page(['a3', 'a4']));
		act(() => rate(store, 'a1'));
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(ids(result.current.answers)).toEqual(['a1', 'a2']);

		act(() => rate(store, 'a2'));
		await waitFor(() => expect(ids(result.current.answers)).toEqual(['a3', 'a4']));
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('drops an answer rated in the full list when the Rate view returns', async () => {
		mockFetch.mockResolvedValueOnce(page(['a1', 'a2']));
		const store = makeStore();
		const { result, rerender } = renderBatch(store);
		await waitFor(() => expect(result.current.answers).toHaveLength(2));

		rerender({ isActive: false });
		act(() => rate(store, 'a1'));
		rerender({ isActive: true });

		await waitFor(() => expect(ids(result.current.answers)).toEqual(['a2']));
	});

	it('leaves out an answer the server had not yet heard was rated', async () => {
		const store = makeStore();
		rate(store, 'a1');
		mockFetch.mockResolvedValueOnce(page(['a1', 'a2']));
		const { result } = renderBatch(store);

		await waitFor(() => expect(ids(result.current.answers)).toEqual(['a2']));
	});

	it('says when nothing is left to rate, and stops asking', async () => {
		mockFetch.mockResolvedValueOnce(page(['a1'], { hasMore: false, remaining: 0 }));
		const store = makeStore();
		const { result } = renderBatch(store);
		await waitFor(() => expect(result.current.answers).toHaveLength(1));
		expect(result.current.isFinished).toBe(false);

		act(() => rate(store, 'a1'));

		await waitFor(() => expect(result.current.isFinished).toBe(true));
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('falls back to the plain list when the server counts 30 answers or fewer', async () => {
		mockFetch.mockResolvedValueOnce(page(['a1'], { totalAnswers: 30 }));
		const store = makeStore();
		renderBatch(store);

		await waitFor(() =>
			expect(store.getState().answerViews.plainListQuestions[QUESTION]).toBe(true),
		);
		expect(rateBatchSelector(QUESTION)(store.getState())).toBeUndefined();
	});

	it('records a failure for this view only and does not retry on its own', async () => {
		mockFetch.mockRejectedValueOnce(new Error('resource-exhausted'));
		const store = makeStore();
		renderBatch(store);

		await waitFor(() =>
			expect(store.getState().answerViews.rateBatchFailures[QUESTION]).toBeDefined(),
		);
		expect(store.getState().answerViews.plainListQuestions[QUESTION]).toBeUndefined();
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('retries when the view reopens after the backoff, and clears the failure', async () => {
		const store = makeStore();
		store.dispatch(recordRateBatchFailure({ questionId: QUESTION, failures: 1, retryAt: 0 }));
		mockFetch.mockResolvedValueOnce(page(['a1']));
		renderBatch(store);

		await waitFor(() =>
			expect(store.getState().answerViews.rateBatchFailures[QUESTION]).toBeUndefined(),
		);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('does not retry before the backoff has passed', () => {
		const store = makeStore();
		store.dispatch(
			recordRateBatchFailure({ questionId: QUESTION, failures: 1, retryAt: Date.now() + 60_000 }),
		);

		renderBatch(store);

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('retries when the tab returns', async () => {
		const store = makeStore();
		store.dispatch(
			recordRateBatchFailure({ questionId: QUESTION, failures: 1, retryAt: Date.now() + 50 }),
		);
		renderBatch(store);
		expect(mockFetch).not.toHaveBeenCalled();
		mockFetch.mockResolvedValueOnce(page(['a1']));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 80));
			document.dispatchEvent(new Event('visibilitychange'));
		});

		await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
	});

	it('is not blocked by an answer that has since been removed', async () => {
		const store = makeStore();
		mockFetch.mockResolvedValueOnce(page(['a1', 'gone']));
		const { result } = renderBatch(store);
		await waitFor(() => expect(ids(result.current.answers)).toEqual(['a1']));

		mockFetch.mockResolvedValueOnce(page(['a2']));
		act(() => rate(store, 'a1'));

		await waitFor(() => expect(ids(result.current.answers)).toEqual(['a2']));
	});

	it('does not show a card once its answer is hidden', async () => {
		const store = makeStore();
		mockFetch.mockResolvedValueOnce(page(['a1', 'a2']));
		const { result } = renderBatch(store);
		await waitFor(() => expect(result.current.answers).toHaveLength(2));

		act(() => {
			store.dispatch(setStatements([{ ...answer('a1'), hide: true }]));
		});

		expect(ids(result.current.answers)).toEqual(['a2']);
	});

	it('asks again a bounded number of times when told there is more but given nothing, then finishes', async () => {
		jest.useFakeTimers();
		try {
			mockFetch.mockResolvedValue(page([]));
			const { result } = renderBatch(makeStore());

			for (let round = 0; round < RATE_VIEW.EMPTY_BATCH_RETRIES + 3; round++) {
				await act(async () => {
					await jest.advanceTimersByTimeAsync(RATE_VIEW.EMPTY_BATCH_RETRY_MS + 10);
				});
			}

			expect(mockFetch).toHaveBeenCalledTimes(RATE_VIEW.EMPTY_BATCH_RETRIES + 1);
			expect(result.current.isFinished).toBe(true);
		} finally {
			jest.useRealTimers();
		}
	});

	it('asks again for later answers after finishing, no sooner than the interval', async () => {
		jest.useFakeTimers();
		const random = jest.spyOn(Math, 'random').mockReturnValue(0);
		try {
			mockFetch.mockResolvedValueOnce(page(['a1'], { hasMore: false, remaining: 0 }));
			const store = makeStore();
			const { result, rerender } = renderBatch(store);
			await act(async () => {
				await jest.advanceTimersByTimeAsync(0);
			});
			act(() => rate(store, 'a1'));
			await act(async () => {
				await jest.advanceTimersByTimeAsync(0);
			});
			expect(result.current.isFinished).toBe(true);

			mockFetch.mockResolvedValue(page(['a2'], { hasMore: false, remaining: 0 }));
			rerender({ isActive: true, count: 41 });
			await act(async () => {
				await jest.advanceTimersByTimeAsync(RATE_VIEW.FINISHED_REFRESH_MS - 1000);
			});
			expect(mockFetch).toHaveBeenCalledTimes(1);

			await act(async () => {
				await jest.advanceTimersByTimeAsync(1500);
			});
			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(ids(result.current.answers)).toEqual(['a2']);
		} finally {
			random.mockRestore();
			jest.useRealTimers();
		}
	});

	it('asks for the new question when the reader moved there during a call', async () => {
		let finishFirst: (value: AnswerBatchPage) => void = () => undefined;
		mockFetch.mockReturnValueOnce(
			new Promise((resolve) => {
				finishFirst = resolve;
			}),
		);
		const store = makeStore();
		const wrapper = ({ children }: { children: ReactNode }) => (
			<Provider store={store}>{children}</Provider>
		);
		const { rerender } = renderHook(({ id }: { id: string }) => useAnswerBatch(id, true, 40), {
			initialProps: { id: QUESTION },
			wrapper,
		});
		expect(mockFetch).toHaveBeenCalledTimes(1);

		mockFetch.mockResolvedValueOnce(page([]));
		rerender({ id: 'other-question' });
		expect(mockFetch).toHaveBeenCalledTimes(1);

		await act(async () => {
			finishFirst(page(['a1']));
		});

		await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('other-question'));
	});

	it('listens to the batch on screen only and stops when it changes or unmounts', async () => {
		const stop = jest.fn();
		mockListen.mockReturnValueOnce(stop);
		mockFetch.mockResolvedValueOnce(page(['a1', 'a2']));
		const { result, unmount } = renderBatch(makeStore());
		await waitFor(() => expect(result.current.answers).toHaveLength(2));

		expect(mockListen).toHaveBeenCalledWith(QUESTION, ['a1', 'a2']);
		unmount();
		expect(stop).toHaveBeenCalledTimes(1);
	});
});

describe('moreToRateSelector', () => {
	it('adds what is unrated in this batch to what the sampler has left', () => {
		const store = makeStore();
		store.dispatch(
			setRateBatch({
				questionId: QUESTION,
				entry: { ids: ['a1', 'a2'], hasMore: true, remaining: 5 },
			}),
		);
		rate(store, 'a1');

		expect(moreToRateSelector(QUESTION)(store.getState())).toBe(6);
	});
});
