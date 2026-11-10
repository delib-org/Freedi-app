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
	setRateBatch,
} from '@/redux/answerViews/answerViewsSlice';
import { AnswerBatchPage, fetchAnswerBatch } from '@/controllers/db/statements/answerBatch';
import { useAnswerBatch } from '../useAnswerBatch';

jest.mock('@/controllers/db/statements/answerBatch', () => ({
	fetchAnswerBatch: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({
	...jest.requireActual('@/utils/errorHandling'),
	logError: jest.fn(),
}));

const QUESTION = 'q';
const UID = 'me';
const mockFetch = fetchAnswerBatch as jest.MockedFunction<typeof fetchAnswerBatch>;

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

	return renderHook(({ isActive }: { isActive: boolean }) => useAnswerBatch(QUESTION, isActive), {
		initialProps: { isActive: active },
		wrapper,
	});
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

	it('falls back to the plain list when the call fails, without retrying', async () => {
		mockFetch.mockRejectedValueOnce(new Error('denied'));
		const store = makeStore();
		renderBatch(store);

		await waitFor(() =>
			expect(store.getState().answerViews.plainListQuestions[QUESTION]).toBe(true),
		);
		expect(mockFetch).toHaveBeenCalledTimes(1);
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
