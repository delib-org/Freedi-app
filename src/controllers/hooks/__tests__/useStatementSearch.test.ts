import { act, renderHook } from '@testing-library/react';
import {
	StatementType,
	type SearchCandidate,
	type SearchMatch,
	type SearchStatementsResponse,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';
import type { SearchState } from '@/redux/search/searchSlice';
import { useStatementSearch } from '../useStatementSearch';

interface MockState {
	statements: {
		statements: Statement[];
		statementSubscription: StatementSubscription[];
		fullyLoadedScopes: Record<string, unknown>;
	};
	creator: { creator: { uid: string } };
	search: SearchState;
}

let mockState: MockState;
const mockDispatch = jest.fn();
const mockFetchSubscriptionCandidates = jest.fn();
const mockSearchOnServer = jest.fn();
const mockBulkLoad = jest.fn();
const mockCount = jest.fn();

jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: (state: MockState) => unknown) => selector(mockState),
}));
jest.mock('@/controllers/db/search/getSearchCandidates', () => ({
	fetchSubscriptionCandidates: (...args: unknown[]) => mockFetchSubscriptionCandidates(...args),
}));
jest.mock('@/controllers/db/search/searchStatementsOnServer', () => ({
	searchStatementsOnServer: (...args: unknown[]) => mockSearchOnServer(...args),
}));
jest.mock('@/controllers/db/statements/bulkLoadStatements', () => ({
	bulkLoadStatements: (...args: unknown[]) => mockBulkLoad(...args),
	getStatementsCount: (...args: unknown[]) => mockCount(...args),
}));
jest.mock('@/utils/errorHandling', () => ({
	...jest.requireActual('@/utils/errorHandling'),
	logError: jest.fn(),
}));

function statement(id: string, title: string, extra: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statement: title,
		statementType: StatementType.option,
		parentId: 't1',
		topParentId: 't1',
		parents: ['t1'],
		creatorId: 'u1',
		lastUpdate: 1,
		createdAt: 1,
		...extra,
	} as unknown as Statement;
}

function subscription(
	id: string,
	title: string,
	extra: Record<string, unknown> = {},
): StatementSubscription {
	return {
		statementId: id,
		userId: 'u1',
		role: 'member',
		parentId: 'top',
		statementType: StatementType.question,
		lastUpdate: 1,
		statement: {
			statementId: id,
			statement: title,
			statementType: StatementType.question,
			parentId: 'top',
		},
		...extra,
	} as unknown as StatementSubscription;
}

function candidate(id: string, title: string): SearchCandidate {
	return {
		statementId: id,
		title,
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: id,
		lastUpdate: 1,
	};
}

function match(id: string, title: string, kind: SearchMatch['kind'] = 'lexical'): SearchMatch {
	return { candidate: candidate(id, title), score: 0.8, kind };
}

function response(partial: Partial<SearchStatementsResponse>): SearchStatementsResponse {
	return {
		lexical: [],
		semantic: [],
		coverage: { scanned: 0, total: 0 },
		durationMs: 1,
		...partial,
	};
}

const ids = (matches: SearchMatch[]): string[] => matches.map((m) => m.candidate.statementId);

/** Let timers fire and pending promise chains settle. */
async function advance(ms: number): Promise<void> {
	await act(async () => {
		jest.advanceTimersByTime(ms);
	});
	await act(async () => {
		for (let i = 0; i < 10; i++) await Promise.resolve();
	});
}

beforeEach(() => {
	jest.useFakeTimers();
	mockDispatch.mockReset();
	mockFetchSubscriptionCandidates
		.mockReset()
		.mockResolvedValue({ candidates: [], truncated: false });
	mockSearchOnServer.mockReset().mockResolvedValue(response({}));
	mockBulkLoad.mockReset().mockResolvedValue({ loaded: 0, watermark: 5 });
	mockCount.mockReset().mockResolvedValue(0);
	mockState = {
		statements: { statements: [], statementSubscription: [], fullyLoadedScopes: {} },
		creator: { creator: { uid: 'u1' } },
		search: { caches: {} },
	};
});

afterEach(() => {
	jest.useRealTimers();
});

describe('useStatementSearch', () => {
	it('does nothing for a query below the minimum, or with no scope', async () => {
		const { result, rerender } = renderHook(
			({ query, enabled }) => useStatementSearch(enabled ? { kind: 'home' } : null, query),
			{ initialProps: { query: 't', enabled: true } },
		);
		await advance(1000);
		expect(result.current.lexical).toEqual([]);

		rerender({ query: 'talk', enabled: false });
		await advance(1000);
		expect(result.current.lexical).toEqual([]);
		expect(mockFetchSubscriptionCandidates).not.toHaveBeenCalled();
		expect(mockSearchOnServer).not.toHaveBeenCalled();
	});

	it('home: ranks top-level subscriptions fuzzily after the debounce and downloads the rest once', async () => {
		mockState.statements.statementSubscription = [
			subscription('t1', 'Talk of the town'),
			subscription('o1', 'Talk child', { parentId: 't1', statementType: StatementType.option }),
			subscription('z1', 'Talk of someone else', { userId: 'u2' }),
		];

		const { result, rerender } = renderHook(
			({ query }) => useStatementSearch({ kind: 'home' }, query),
			{
				initialProps: { query: '' },
			},
		);
		rerender({ query: 'tlk' });
		expect(result.current.lexical).toEqual([]);

		await advance(250);
		expect(ids(result.current.lexical)).toEqual(['t1']);
		expect(mockFetchSubscriptionCandidates).toHaveBeenCalledTimes(1);
		expect(mockFetchSubscriptionCandidates).toHaveBeenCalledWith('u1', true);
		expect(mockDispatch).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'search/setSearchCandidates' }),
		);
		expect(mockSearchOnServer).not.toHaveBeenCalled();
	});

	it('home: merges a fresh cache with live subscriptions without downloading again', async () => {
		mockState.statements.statementSubscription = [subscription('t1', 'Talk of the town')];
		mockState.search.caches.home = {
			userId: 'u1',
			candidates: [candidate('old', 'Talk archive'), candidate('t1', 'Stale title')],
			fetchedAt: Date.now(),
			truncated: false,
		};

		const { result } = renderHook(() => useStatementSearch({ kind: 'home' }, 'talk'));
		await advance(1000);

		expect(ids(result.current.lexical).sort()).toEqual(['old', 't1']);
		expect(
			result.current.lexical.find((m) => m.candidate.statementId === 't1')?.candidate.title,
		).toBe('Talk of the town');
		expect(mockFetchSubscriptionCandidates).not.toHaveBeenCalled();
	});

	it('subscriptions: asks the server for what a cut-off download missed', async () => {
		mockState.search.caches.subscriptions = {
			userId: 'u1',
			candidates: [candidate('c1', 'Talk nearby')],
			fetchedAt: Date.now(),
			truncated: true,
		};
		mockSearchOnServer.mockResolvedValue(
			response({ lexical: [match('far', 'Talk from long ago')] }),
		);

		const { result, rerender } = renderHook(
			({ query }) => useStatementSearch({ kind: 'subscriptions' }, query),
			{ initialProps: { query: '' } },
		);
		rerender({ query: 'talk' });
		await advance(250);
		expect(ids(result.current.lexical)).toEqual(['c1']);

		await advance(250);
		expect(mockSearchOnServer).toHaveBeenCalledWith({
			scope: { kind: 'subscriptions' },
			query: 'talk',
			lexical: true,
			semantic: false,
		});
		expect(ids(result.current.lexical).sort()).toEqual(['c1', 'far']);
	});

	it('tree: loads a small tree, ranks it locally, and adds similar-meaning hits without repeats', async () => {
		mockState.statements.statements = [
			statement('t1', 'City budget', {
				parentId: 'top',
				parents: [],
				statementType: StatementType.question,
			}),
			statement('o1', 'Talk about parks'),
			statement('o2', 'Green spaces'),
		];
		mockCount.mockResolvedValue(10);
		mockSearchOnServer.mockResolvedValue(
			response({
				semantic: [
					match('o2', 'Green spaces', 'semantic'),
					match('o1', 'Talk about parks', 'semantic'),
				],
			}),
		);

		const { result } = renderHook(() => useStatementSearch({ kind: 'tree', rootId: 't1' }, 'talk'));
		await advance(250);

		expect(mockCount).toHaveBeenCalledWith('t1', 'descendants');
		expect(mockBulkLoad).toHaveBeenCalledWith('t1', 'descendants');
		expect(mockDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'statements/setScopeFullyLoaded',
				payload: { rootId: 't1', mode: 'descendants', watermark: 5 },
			}),
		);
		expect(ids(result.current.lexical)).toEqual(['o1']);
		expect(result.current.isSearchingMeaning).toBe(true);

		await advance(250);
		expect(mockSearchOnServer).toHaveBeenCalledWith({
			scope: { kind: 'tree', rootId: 't1' },
			query: 'talk',
			lexical: false,
			semantic: true,
		});
		expect(ids(result.current.semantic)).toEqual(['o2']);
		expect(result.current.isSearchingMeaning).toBe(false);
	});

	it('tree: leaves a big tree to the server instead of downloading it', async () => {
		mockCount.mockResolvedValue(5000);
		mockSearchOnServer.mockResolvedValue(
			response({
				lexical: [match('x9', 'Talk deep inside')],
				coverage: { scanned: 5000, total: 5000 },
			}),
		);

		const { result } = renderHook(() => useStatementSearch({ kind: 'tree', rootId: 't1' }, 'talk'));
		await advance(250);
		expect(result.current.isLoading).toBe(true);

		await advance(250);
		expect(mockBulkLoad).not.toHaveBeenCalled();
		expect(mockSearchOnServer).toHaveBeenCalledWith(
			expect.objectContaining({ lexical: true, semantic: true }),
		);
		expect(ids(result.current.lexical)).toEqual(['x9']);
		expect(result.current.coverage).toEqual({ scanned: 5000, total: 5000 });
		expect(result.current.isLoading).toBe(false);
	});

	it('keeps local results and flags the error when the server fails', async () => {
		mockState.statements.statements = [statement('o1', 'Talk about parks')];
		mockState.statements.fullyLoadedScopes = {
			t1: { mode: 'descendants', watermark: 1, treeTopId: 't1' },
		};
		mockSearchOnServer.mockRejectedValue(new Error('offline'));

		const { result } = renderHook(() => useStatementSearch({ kind: 'tree', rootId: 't1' }, 'talk'));
		await advance(500);

		expect(ids(result.current.lexical)).toEqual(['o1']);
		expect(result.current.hasError).toBe(true);
		expect(mockCount).not.toHaveBeenCalled();
	});
});
