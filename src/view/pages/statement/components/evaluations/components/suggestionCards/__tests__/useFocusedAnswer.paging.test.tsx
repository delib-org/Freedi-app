import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { configureStore } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import { CHAT } from '@/constants/common';
import { setStatement } from '@/redux/statements/statementsSlice';
import answerViews from '@/redux/answerViews/answerViewsSlice';
import { useLazyLoadOptions } from '@/view/pages/statement/hooks/useLazyLoadOptions';
import { useFocusedAnswer } from '../useFocusedAnswer';

const mockGetStatementFromDB = jest.fn();
const mockFetchOlder = jest.fn();

jest.mock('@/controllers/db/statements/getStatement', () => ({
	getStatementFromDB: (...args: unknown[]) => mockGetStatementFromDB(...args),
}));
jest.mock('@/controllers/db/statements/listenToStatements', () => ({
	fetchOlderSubStatements: (...args: unknown[]) => mockFetchOlder(...args),
}));

const WINDOW_OLDEST = 900;

function answer(statementId: string, createdAt: number): Statement {
	return {
		statementId,
		parentId: 'q1',
		statementType: StatementType.option,
		createdAt,
	} as Statement;
}

interface StatementsState {
	statements: Statement[];
}

/** Keeps exactly what is dispatched, so a stored answer would move the cursor. */
function statementsReducer(
	state: StatementsState = { statements: [answer('a1', WINDOW_OLDEST), answer('a2', 1000)] },
	action: PayloadAction<Statement>,
): StatementsState {
	if (action.type !== setStatement.type) return state;

	return { statements: [...state.statements, action.payload] };
}

function wrapper({ children }: { children: ReactNode }) {
	const store = configureStore({ reducer: { statements: statementsReducer, answerViews } });

	return (
		<Provider store={store}>
			<MemoryRouter initialEntries={['/statement/q1?focusId=old']}>{children}</MemoryRouter>
		</Provider>
	);
}

describe('paging after an answer opened from a link', () => {
	let intersect: IntersectionObserverCallback;

	beforeEach(() => {
		jest.clearAllMocks();
		sessionStorage.clear();
		Element.prototype.scrollIntoView = jest.fn();
		mockFetchOlder.mockResolvedValue({ statements: [], hasMore: true });
		mockGetStatementFromDB.mockResolvedValue(answer('old', 1));
		window.IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => {
			intersect = callback;

			return { observe: jest.fn(), disconnect: jest.fn() };
		}) as unknown as typeof IntersectionObserver;
	});

	it('keeps the cursor at the oldest answer of the window', async () => {
		const shownIds = new Set(['a1', 'a2']);
		const { result } = renderHook(
			() => ({
				focused: useFocusedAnswer('q1', shownIds, false),
				paging: useLazyLoadOptions('q1'),
			}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.focused.focusedAnswer?.statementId).toBe('old'));
		act(() => result.current.paging.sentinelRef(document.createElement('div')));
		await act(async () => {
			intersect(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
			await Promise.resolve();
		});

		expect(mockFetchOlder).toHaveBeenCalledWith('q1', WINDOW_OLDEST, CHAT.LOAD_MORE_BATCH_SIZE);
	});
});
