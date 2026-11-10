import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';
import { UI } from '@/constants/common';
import { useFocusedAnswer } from '../useFocusedAnswer';

const mockGetStatementFromDB = jest.fn();
let mockLoaded = false;

jest.mock('react-redux', () => ({
	useSelector: () => (mockLoaded ? { statementId: 'loaded' } : undefined),
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({
	getStatementFromDB: (...args: unknown[]) => mockGetStatementFromDB(...args),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelectorById: () => () => undefined,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

function wrapper(url: string) {
	return function RouterWrapper({ children }: { children: ReactNode }) {
		return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
	};
}

function option(id: string, overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		parentId: 'q1',
		statementType: StatementType.option,
		...overrides,
	} as Statement;
}

async function flush(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

function renderFocused(url: string, shownIds: ReadonlySet<string>, isSortChosen = false) {
	return renderHook(
		({ ids }) => ({
			focused: useFocusedAnswer('q1', ids, isSortChosen),
			search: useLocation().search,
		}),
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

	it('holds an answer that is not in the store, without storing it', async () => {
		const answer = option('old');
		mockGetStatementFromDB.mockResolvedValue(answer);
		const { result } = renderFocused('/statement/q1?focusId=old', new Set());

		await waitFor(() => expect(result.current.focused.focusedAnswer).toBe(answer));
		expect(mockGetStatementFromDB).toHaveBeenCalledTimes(1);
		expect(mockGetStatementFromDB).toHaveBeenCalledWith('old');
		expect(result.current.focused.ringId).toBe('old');
	});

	it('does not fail when the answer no longer exists', async () => {
		const { result } = renderFocused('/statement/q1?focusId=gone', new Set(['a1']));

		await waitFor(() => expect(mockGetStatementFromDB).toHaveBeenCalledWith('gone'));
		await flush();
		expect(result.current.focused.focusedAnswer).toBeUndefined();
		expect(result.current.focused.ringId).toBeUndefined();
		expect(sessionStorage.getItem('focusedAnswer:q1')).toBeNull();
	});

	it.each([
		['a chat message', { statementType: StatementType.statement }],
		['a hidden answer', { hide: true }],
		['an answer of another question', { parentId: 'q2' }],
	])('never brings in %s', async (_label, overrides) => {
		mockGetStatementFromDB.mockResolvedValue(option('x', overrides));
		const { result } = renderFocused('/statement/q1?focusId=x', new Set());

		await waitFor(() => expect(mockGetStatementFromDB).toHaveBeenCalled());
		await flush();
		expect(result.current.focused.focusedAnswer).toBeUndefined();
		expect(result.current.focused.ringId).toBeUndefined();
	});

	it('does not pin when the reader chose a sort, and that ends an earlier pin', () => {
		sessionStorage.setItem('focusedAnswer:q1', 'a1');
		const { result } = renderFocused('/statement/q1', new Set(['a1']), true);

		expect(result.current.focused.pinnedId).toBeUndefined();
		expect(sessionStorage.getItem('focusedAnswer:q1')).toBeNull();
	});

	it('still rings a card under a chosen sort, without pinning it or fetching', () => {
		mockLoaded = true;
		const { result } = renderFocused('/statement/q1?focusId=a1', new Set(['a1']), true);

		expect(result.current.focused.pinnedId).toBeUndefined();
		expect(result.current.focused.ringId).toBe('a1');
		expect(sessionStorage.getItem('focusedAnswer:q1')).toBeNull();
	});

	it('does not fetch an answer that a chosen sort has no place for', async () => {
		renderFocused('/statement/q1?focusId=old', new Set(), true);
		await flush();

		expect(mockGetStatementFromDB).not.toHaveBeenCalled();
	});
});
