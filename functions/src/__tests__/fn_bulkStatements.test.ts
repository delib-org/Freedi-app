import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'firebase-functions/v1';

/**
 * Unit tests for the getBulkStatements HTTP endpoint and the deletion
 * tombstone trigger. The endpoint powers "Load all statements" on map views:
 * auth-gated, cursor-paginated by document ID, with a short per-instance
 * response cache.
 */

const mockVerifyAuthToken = jest.fn<(req: Request, res: Response) => Promise<string | null>>();
const mockGet = jest.fn<() => Promise<unknown>>();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockStartAfter = jest.fn();
const mockDocSet = jest.fn<(data: unknown) => Promise<unknown>>();
const mockDoc = jest.fn(() => ({ set: mockDocSet }));
const mockCollection = jest.fn();

// Chainable query mock — every builder method returns the same object
const queryMock: Record<string, unknown> = {};
queryMock.where = mockWhere.mockReturnValue(queryMock);
queryMock.orderBy = mockOrderBy.mockReturnValue(queryMock);
queryMock.limit = mockLimit.mockReturnValue(queryMock);
queryMock.startAfter = mockStartAfter.mockReturnValue(queryMock);
queryMock.get = mockGet;
queryMock.doc = mockDoc;
mockCollection.mockReturnValue(queryMock);

jest.mock('../index', () => ({
	db: { collection: mockCollection },
}));

jest.mock('../utils/httpAuth', () => ({
	verifyAuthToken: mockVerifyAuthToken,
}));

jest.mock('firebase-admin/firestore', () => ({
	Timestamp: {
		fromMillis: (ms: number) => ({ toMillis: () => ms }),
	},
}));

import { getBulkStatements, writeStatementDeletionTombstone } from '../fn_bulkStatements';

interface MockResponse {
	statusCode?: number;
	body?: unknown;
	status: jest.Mock<(code: number) => MockResponse>;
	json: jest.Mock<(body?: unknown) => MockResponse>;
	send: jest.Mock<(body?: unknown) => MockResponse>;
	type: jest.Mock<(t: string) => MockResponse>;
}

function makeRes(): MockResponse {
	const res = {} as MockResponse;
	res.status = jest.fn((code: number) => {
		res.statusCode = code;

		return res;
	});
	res.json = jest.fn((body?: unknown) => {
		res.body = body;

		return res;
	});
	res.send = jest.fn((body?: unknown) => {
		res.body = typeof body === 'string' ? JSON.parse(body) : body;

		return res;
	});
	res.type = jest.fn(() => res);

	return res;
}

function makeReq(query: Record<string, string>): Request {
	return { query, headers: {} } as unknown as Request;
}

const asRes = (res: MockResponse): Response => res as unknown as Response;

function makeSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
	return {
		docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
	};
}

let uniqueRootCounter = 0;
/** Distinct rootId per test so the module-level response cache never collides */
function uniqueRootId(): string {
	uniqueRootCounter++;

	return `root-${uniqueRootCounter}`;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockWhere.mockReturnValue(queryMock);
	mockOrderBy.mockReturnValue(queryMock);
	mockLimit.mockReturnValue(queryMock);
	mockStartAfter.mockReturnValue(queryMock);
	mockCollection.mockReturnValue(queryMock);
	mockDoc.mockReturnValue({ set: mockDocSet });
	mockVerifyAuthToken.mockResolvedValue('user-1');
});

describe('getBulkStatements', () => {
	it('stops without querying when authentication fails', async () => {
		mockVerifyAuthToken.mockResolvedValue(null);
		const res = makeRes();

		await getBulkStatements(makeReq({ rootId: uniqueRootId(), mode: 'direct' }), asRes(res));

		expect(mockCollection).not.toHaveBeenCalled();
	});

	it('returns 400 when rootId is missing', async () => {
		const res = makeRes();

		await getBulkStatements(makeReq({ mode: 'direct' }), asRes(res));

		expect(res.statusCode).toBe(400);
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('returns 400 for an invalid mode', async () => {
		const res = makeRes();

		await getBulkStatements(makeReq({ rootId: uniqueRootId(), mode: 'everything' }), asRes(res));

		expect(res.statusCode).toBe(400);
		expect(mockGet).not.toHaveBeenCalled();
	});

	it("queries by parentId for mode 'direct' and filters hidden statements", async () => {
		const rootId = uniqueRootId();
		mockGet.mockResolvedValue(
			makeSnapshot([
				{ id: 'a', data: { statementId: 'a', lastUpdate: 1 } },
				{ id: 'b', data: { statementId: 'b', lastUpdate: 2, hide: true } },
			]),
		);
		const res = makeRes();

		await getBulkStatements(makeReq({ rootId, mode: 'direct' }), asRes(res));

		expect(mockWhere).toHaveBeenCalledWith('parentId', '==', rootId);
		expect(res.statusCode).toBe(200);
		const body = res.body as { statements: Array<{ statementId: string }>; nextCursor: string | null };
		expect(body.statements.map((s) => s.statementId)).toEqual(['a']);
		expect(body.nextCursor).toBeNull();
	});

	it("queries by parents array-contains for mode 'descendants'", async () => {
		const rootId = uniqueRootId();
		mockGet.mockResolvedValue(makeSnapshot([]));
		const res = makeRes();

		await getBulkStatements(makeReq({ rootId, mode: 'descendants' }), asRes(res));

		expect(mockWhere).toHaveBeenCalledWith('parents', 'array-contains', rootId);
		expect(res.statusCode).toBe(200);
	});

	it('returns nextCursor when a full page comes back, and honors the cursor param', async () => {
		const rootId = uniqueRootId();
		const fullPage = Array.from({ length: 2 }, (_, i) => ({
			id: `doc-${i}`,
			data: { statementId: `doc-${i}`, lastUpdate: i },
		}));
		mockGet.mockResolvedValue(makeSnapshot(fullPage));
		const res = makeRes();

		await getBulkStatements(makeReq({ rootId, mode: 'direct', pageSize: '2' }), asRes(res));

		const body = res.body as { nextCursor: string | null };
		expect(body.nextCursor).toBe('doc-1');

		// Follow the cursor
		mockGet.mockResolvedValue(makeSnapshot([]));
		const res2 = makeRes();
		await getBulkStatements(
			makeReq({ rootId, mode: 'direct', pageSize: '2', cursor: 'doc-1' }),
			asRes(res2),
		);

		expect(mockStartAfter).toHaveBeenCalledWith('doc-1');
		expect((res2.body as { nextCursor: string | null }).nextCursor).toBeNull();
	});

	it('serves identical requests from the per-instance cache without re-querying', async () => {
		const rootId = uniqueRootId();
		mockGet.mockResolvedValue(
			makeSnapshot([{ id: 'a', data: { statementId: 'a', lastUpdate: 1 } }]),
		);

		await getBulkStatements(makeReq({ rootId, mode: 'direct' }), asRes(makeRes()));
		const res2 = makeRes();
		await getBulkStatements(makeReq({ rootId, mode: 'direct' }), asRes(res2));

		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(res2.statusCode).toBe(200);
		const body = res2.body as { statements: Array<{ statementId: string }> };
		expect(body.statements.map((s) => s.statementId)).toEqual(['a']);
	});

	it('clamps pageSize to the maximum', async () => {
		const rootId = uniqueRootId();
		mockGet.mockResolvedValue(makeSnapshot([]));

		await getBulkStatements(
			makeReq({ rootId, mode: 'direct', pageSize: '99999' }),
			asRes(makeRes()),
		);

		expect(mockLimit).toHaveBeenCalledWith(500);
	});
});

describe('writeStatementDeletionTombstone', () => {
	it('writes a tombstone with the deleted statement scope fields', async () => {
		mockDocSet.mockResolvedValue(undefined);
		const event = {
			params: { statementId: 'st-1' },
			data: {
				data: () => ({
					statementId: 'st-1',
					parentId: 'parent-1',
					topParentId: 'top-1',
					parents: ['top-1', 'parent-1'],
				}),
			},
		};

		await writeStatementDeletionTombstone(
			event as unknown as Parameters<typeof writeStatementDeletionTombstone>[0],
		);

		expect(mockCollection).toHaveBeenCalledWith('statementDeletions');
		expect(mockDoc).toHaveBeenCalledWith('st-1');
		const written = mockDocSet.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
		expect(written.statementId).toBe('st-1');
		expect(written.parentId).toBe('parent-1');
		expect(written.topParentId).toBe('top-1');
		expect(written.parents).toEqual(['top-1', 'parent-1']);
		expect(typeof written.deletedAtMs).toBe('number');
		expect(written.expireAt).toBeDefined();
	});

	it('does nothing when the event has no data', async () => {
		await writeStatementDeletionTombstone({
			params: { statementId: 'st-1' },
			data: undefined,
		} as unknown as Parameters<typeof writeStatementDeletionTombstone>[0]);

		expect(mockDocSet).not.toHaveBeenCalled();
	});
});
