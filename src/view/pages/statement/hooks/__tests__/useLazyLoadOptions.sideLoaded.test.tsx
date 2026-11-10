import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import { CHAT } from '@/constants/common';
import answerViews, { markSideLoaded } from '@/redux/answerViews/answerViewsSlice';
import statements, { setStatements } from '@/redux/statements/statementsSlice';
import { useLazyLoadOptions } from '../useLazyLoadOptions';

const mockFetchOlder = jest.fn();

jest.mock('@/controllers/db/statements/listenToStatements', () => ({
	fetchOlderSubStatements: (...args: unknown[]) => mockFetchOlder(...args),
}));

const WINDOW_OLDEST = 900;
const SIDE_LOADED_AT = 10;

function answer(statementId: string, createdAt: number): Statement {
	return {
		statementId,
		statement: statementId,
		parentId: 'q1',
		statementType: StatementType.option,
		createdAt,
		lastUpdate: createdAt,
	} as Statement;
}

function makeStore() {
	const store = configureStore({ reducer: { statements, answerViews } });
	store.dispatch(setStatements([answer('a1', WINDOW_OLDEST), answer('a2', 1000)]));

	return store;
}

describe('useLazyLoadOptions with answers fetched ahead of the window', () => {
	let intersect: IntersectionObserverCallback;

	async function reachSentinel(sentinelRef: (node: HTMLElement | null) => void): Promise<void> {
		act(() => sentinelRef(document.createElement('div')));
		await act(async () => {
			intersect(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
			await Promise.resolve();
		});
	}

	beforeEach(() => {
		jest.clearAllMocks();
		mockFetchOlder.mockResolvedValue({ statements: [], hasMore: true });
		window.IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => {
			intersect = callback;

			return { observe: jest.fn(), disconnect: jest.fn() };
		}) as unknown as typeof IntersectionObserver;
	});

	function render(store: ReturnType<typeof makeStore>) {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<Provider store={store}>{children}</Provider>
		);

		return renderHook(() => useLazyLoadOptions('q1'), { wrapper });
	}

	it('keeps paging from the window when an older answer was fetched for a batch', async () => {
		const store = makeStore();
		store.dispatch(markSideLoaded(['batch-answer']));
		store.dispatch(setStatements([answer('batch-answer', SIDE_LOADED_AT)]));
		const { result } = render(store);

		await reachSentinel(result.current.sentinelRef);

		expect(mockFetchOlder).toHaveBeenCalledWith('q1', WINDOW_OLDEST, CHAT.LOAD_MORE_BATCH_SIZE);
	});

	it('moves on when a page held only answers that were already side-loaded', async () => {
		const store = makeStore();
		store.dispatch(markSideLoaded(['batch-answer']));
		store.dispatch(setStatements([answer('batch-answer', 800)]));
		mockFetchOlder.mockResolvedValueOnce({
			statements: [answer('batch-answer', 800)],
			hasMore: true,
		});
		const { result } = render(store);

		await reachSentinel(result.current.sentinelRef);
		await reachSentinel(result.current.sentinelRef);

		expect(mockFetchOlder).toHaveBeenLastCalledWith('q1', 800, CHAT.LOAD_MORE_BATCH_SIZE);
	});
});
