import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';
import { UI } from '@/constants/common';
import { useFocusedAnswer } from '../useFocusedAnswer';

const mockDispatch = jest.fn();
const mockGetStatementFromDB = jest.fn();
let mockLoaded = false;

jest.mock('react-redux', () => ({
	useDispatch: () => mockDispatch,
	useSelector: () => (mockLoaded ? { statementId: 'loaded' } : undefined),
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({
	getStatementFromDB: (...args: unknown[]) => mockGetStatementFromDB(...args),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatement: (statement: Statement) => ({ type: 'setStatement', payload: statement }),
	statementSelectorById: () => () => undefined,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

function wrapper(url: string) {
	return function RouterWrapper({ children }: { children: ReactNode }) {
		return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
	};
}

function renderFocused(url: string, shownIds: ReadonlySet<string>) {
	return renderHook(
		({ ids }) => ({ focused: useFocusedAnswer('q1', ids), search: useLocation().search }),
		{ wrapper: wrapper(url), initialProps: { ids: shownIds } },
	);
}

describe('useFocusedAnswer', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLoaded = false;
		sessionStorage.clear();
		mockGetStatementFromDB.mockResolvedValue(undefined);
		Element.prototype.scrollIntoView = jest.fn();
	});

	it('pins and rings a card that is on screen, then uses up the parameter', async () => {
		mockLoaded = true;
		const { result } = renderFocused('/statement/q1?tab=options&focusId=a1', new Set(['a1']));

		await waitFor(() => expect(result.current.search).toBe('?tab=options'));
		expect(result.current.focused.pinnedId).toBe('a1');
		expect(result.current.focused.ringId).toBe('a1');
		expect(mockGetStatementFromDB).not.toHaveBeenCalled();
	});

	it('keeps the pin for the session without the parameter, and does not ring again', () => {
		sessionStorage.setItem('focusedAnswer:q1', 'a1');
		const { result } = renderFocused('/statement/q1', new Set(['a1']));

		expect(result.current.focused.pinnedId).toBe('a1');
		expect(result.current.focused.ringId).toBeUndefined();
	});

	it('removes the ring after its time is up', () => {
		jest.useFakeTimers();
		mockLoaded = true;
		const { result } = renderFocused('/statement/q1?focusId=a1', new Set(['a1']));

		expect(result.current.focused.ringId).toBe('a1');
		act(() => {
			jest.advanceTimersByTime(UI.FOCUSED_ANSWER_RING_DURATION);
		});
		expect(result.current.focused.ringId).toBeUndefined();
		jest.useRealTimers();
	});

	it('loads one document when the answer is not in the store', async () => {
		const answer = {
			statementId: 'old',
			parentId: 'q1',
			statementType: StatementType.option,
		} as Statement;
		mockGetStatementFromDB.mockResolvedValue(answer);
		renderFocused('/statement/q1?focusId=old', new Set());

		await waitFor(() =>
			expect(mockDispatch).toHaveBeenCalledWith({ type: 'setStatement', payload: answer }),
		);
		expect(mockGetStatementFromDB).toHaveBeenCalledTimes(1);
		expect(mockGetStatementFromDB).toHaveBeenCalledWith('old');
	});

	it('does not fail when the answer no longer exists', async () => {
		const { result } = renderFocused('/statement/q1?focusId=gone', new Set(['a1']));

		await waitFor(() => expect(mockGetStatementFromDB).toHaveBeenCalledWith('gone'));
		expect(mockDispatch).not.toHaveBeenCalled();
		expect(result.current.focused.ringId).toBeUndefined();
		expect(sessionStorage.getItem('focusedAnswer:q1')).toBeNull();
	});

	it('ignores a focusId that points at a chat message', async () => {
		mockGetStatementFromDB.mockResolvedValue({
			statementId: 'm1',
			parentId: 'q1',
			statementType: StatementType.statement,
		} as Statement);
		renderFocused('/statement/q1?focusId=m1', new Set());

		await waitFor(() => expect(mockGetStatementFromDB).toHaveBeenCalled());
		await act(async () => {
			await Promise.resolve();
		});
		expect(mockDispatch).not.toHaveBeenCalled();
	});
});
