/**
 * Unit tests for the bulk "Load all statements" client controller:
 * the HTTP pagination loop, progress callbacks, and watermark math
 * (max lastUpdate minus the delta-overlap safety window).
 */

jest.mock('firebase/firestore', () => ({
	collection: jest.fn(),
	query: jest.fn(),
	where: jest.fn(),
	orderBy: jest.fn(),
	getCountFromServer: jest.fn(),
}));

jest.mock('../../config', () => ({
	FireStore: {},
	auth: {
		currentUser: {
			getIdToken: jest.fn(() => Promise.resolve('test-id-token')),
		},
	},
}));

jest.mock('valibot', () => {
	const actual = jest.requireActual('valibot') as Record<string, unknown>;

	return {
		...actual,
		parse: jest.fn((_schema: unknown, value: unknown) => value),
	};
});

jest.mock('@/helpers/timestampHelpers', () => ({
	normalizeStatementData: jest.fn((data: unknown) => data),
}));

const mockDispatch = jest.fn();
jest.mock('@/redux/store', () => ({
	store: { dispatch: (action: unknown) => mockDispatch(action) },
}));

jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatement: jest.fn((payload: unknown) => ({ type: 'statements/setStatement', payload })),
	setStatements: jest.fn((payload: unknown) => ({ type: 'statements/setStatements', payload })),
	deleteStatement: jest.fn((payload: unknown) => ({
		type: 'statements/deleteStatement',
		payload,
	})),
}));

jest.mock('@/controllers/general/apiEndpoint', () => ({
	APIEndPoint: jest.fn((functionName: string, params: Record<string, string | number>) => {
		const queryString = Object.entries(params)
			.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
			.join('&');

		return `http://test.local/${functionName}?${queryString}`;
	}),
}));

jest.mock('@/controllers/utils/firestoreListenerHelpers', () => ({
	createManagedCollectionListener: jest.fn(() => jest.fn()),
	generateListenerKey: jest.fn(
		(component: string, type: string, id: string) => `${component}-${type}-${id}`,
	),
}));

jest.mock('@/utils/errorHandling', () => {
	const actual = jest.requireActual('@/utils/errorHandling');

	return {
		...actual,
		logError: jest.fn(),
	};
});

import { bulkLoadStatements } from '../bulkLoadStatements';
import { BULK_LOAD } from '@/constants/common';

interface MockPage {
	ok: boolean;
	statements: Array<Record<string, unknown>>;
	nextCursor: string | null;
	serverTime: number;
}

function mockFetchPages(pages: MockPage[]): jest.Mock {
	const fetchMock = jest.fn();
	pages.forEach((page) => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(page),
		});
	});
	global.fetch = fetchMock as unknown as typeof fetch;

	return fetchMock;
}

function makeStatement(id: string, lastUpdate: number): Record<string, unknown> {
	return { statementId: id, lastUpdate };
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('bulkLoadStatements', () => {
	it('loads a single page and computes the watermark with the overlap rewind', async () => {
		mockFetchPages([
			{
				ok: true,
				statements: [makeStatement('a', 1000), makeStatement('b', 9000)],
				nextCursor: null,
				serverTime: 10000,
			},
		]);

		const result = await bulkLoadStatements('root-1', 'descendants');

		expect(result.loaded).toBe(2);
		expect(result.watermark).toBe(9000 - BULK_LOAD.DELTA_OVERLAP_MS);
		expect(mockDispatch).toHaveBeenCalledTimes(1);
	});

	it('follows nextCursor across pages and reports progress', async () => {
		const fetchMock = mockFetchPages([
			{
				ok: true,
				statements: [makeStatement('a', 100), makeStatement('b', 200)],
				nextCursor: 'b',
				serverTime: 1,
			},
			{
				ok: true,
				statements: [makeStatement('c', 300)],
				nextCursor: null,
				serverTime: 2,
			},
		]);

		const progress: number[] = [];
		const result = await bulkLoadStatements('root-1', 'direct', (loaded) => progress.push(loaded));

		expect(result.loaded).toBe(3);
		expect(progress).toEqual([2, 3]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		// Second request must carry the cursor
		const secondUrl = fetchMock.mock.calls[1][0] as string;
		expect(secondUrl).toContain('cursor=b');
		// Watermark derives from the max lastUpdate across ALL pages
		expect(result.watermark).toBe(Math.max(0, 300 - BULK_LOAD.DELTA_OVERLAP_MS));
	});

	it('sends the ID token in the Authorization header', async () => {
		const fetchMock = mockFetchPages([
			{ ok: true, statements: [], nextCursor: null, serverTime: 1 },
		]);

		await bulkLoadStatements('root-1', 'direct');

		const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
		expect(init.headers.Authorization).toBe('Bearer test-id-token');
	});

	it('throws a NetworkError when the endpoint responds with an error status', async () => {
		const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
		global.fetch = fetchMock as unknown as typeof fetch;

		await expect(bulkLoadStatements('root-1', 'direct')).rejects.toThrow(
			'getBulkStatements failed with status 500',
		);
	});

	it('never returns a negative watermark', async () => {
		mockFetchPages([
			{
				ok: true,
				statements: [makeStatement('a', 100)],
				nextCursor: null,
				serverTime: 1,
			},
		]);

		const result = await bulkLoadStatements('root-1', 'direct');

		expect(result.watermark).toBe(0);
	});
});
