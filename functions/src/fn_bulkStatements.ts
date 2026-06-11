import { Request, Response } from 'firebase-functions/v1';
import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { Collections, Statement, StatementDeletion } from '@freedi/shared-types';
import { db } from './index';
import { logError } from './utils/errorHandling';
import { verifyAuthToken } from './utils/httpAuth';

/** Scope of a bulk fetch: direct children only, or the whole subtree. */
type BulkFetchMode = 'direct' | 'descendants';

const BULK_FETCH = {
	/** Max statements returned per page (also the default). */
	MAX_PAGE_SIZE: 500,
	/** Per-instance response-cache TTL — amortizes bursts of identical loads. */
	CACHE_TTL_MS: 30 * 1000,
	/** Max cached responses kept per instance. */
	CACHE_MAX_ENTRIES: 100,
	/** Tombstone retention before Firestore TTL purges it. */
	TOMBSTONE_TTL_MS: 30 * 24 * 60 * 60 * 1000,
} as const;

const responseCache = new Map<string, { at: number; body: string }>();

function getCached(key: string): string | null {
	const entry = responseCache.get(key);
	if (!entry) return null;
	if (Date.now() - entry.at > BULK_FETCH.CACHE_TTL_MS) {
		responseCache.delete(key);

		return null;
	}

	return entry.body;
}

function setCached(key: string, body: string): void {
	if (responseCache.size >= BULK_FETCH.CACHE_MAX_ENTRIES) {
		// Evict the oldest entry (Map preserves insertion order)
		const oldest = responseCache.keys().next().value;
		if (oldest !== undefined) responseCache.delete(oldest);
	}
	responseCache.set(key, { at: Date.now(), body });
}

function isBulkFetchMode(value: unknown): value is BulkFetchMode {
	return value === 'direct' || value === 'descendants';
}

/**
 * GET /getBulkStatements?rootId=<id>&mode=direct|descendants&cursor=<docId>&pageSize=<n>
 *
 * Returns one page of statements under rootId, ordered by document ID for
 * stable index-free pagination. The client drives the pagination loop so it
 * can render streaming progress. Requires a Firebase ID token.
 *
 * Response: { ok, statements, nextCursor, pageSize, serverTime }
 */
export async function getBulkStatements(req: Request, res: Response): Promise<void> {
	const uid = await verifyAuthToken(req, res);
	if (!uid) return;

	const { rootId, mode, cursor } = req.query;

	try {
		if (typeof rootId !== 'string' || rootId.length === 0) {
			res.status(400).json({ ok: false, error: 'rootId is required' });

			return;
		}
		if (!isBulkFetchMode(mode)) {
			res.status(400).json({ ok: false, error: "mode must be 'direct' or 'descendants'" });

			return;
		}

		const requestedPageSize = Number(req.query.pageSize);
		const pageSize =
			Number.isInteger(requestedPageSize) && requestedPageSize > 0
				? Math.min(requestedPageSize, BULK_FETCH.MAX_PAGE_SIZE)
				: BULK_FETCH.MAX_PAGE_SIZE;

		const cursorId = typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
		const cacheKey = `${mode}:${rootId}:${cursorId ?? ''}:${pageSize}`;

		const cached = getCached(cacheKey);
		if (cached) {
			res.status(200).type('application/json').send(cached);

			return;
		}

		let query =
			mode === 'direct'
				? db.collection(Collections.statements).where('parentId', '==', rootId)
				: db.collection(Collections.statements).where('parents', 'array-contains', rootId);

		query = query.orderBy('__name__').limit(pageSize);
		if (cursorId) {
			query = query.startAfter(cursorId);
		}

		const snapshot = await query.get();
		const statements = snapshot.docs
			.map((doc) => doc.data() as Statement)
			.filter((statement) => !statement.hide);

		const nextCursor =
			snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null;

		const body = JSON.stringify({
			ok: true,
			statements,
			nextCursor,
			pageSize,
			serverTime: Date.now(),
		});

		setCached(cacheKey, body);
		res.status(200).type('application/json').send(body);
	} catch (error) {
		logError(error, {
			operation: 'fn_bulkStatements.getBulkStatements',
			userId: uid,
			statementId: typeof rootId === 'string' ? rootId : undefined,
			metadata: { mode, cursor },
		});
		res.status(500).json({ ok: false, error: 'Internal Server Error' });
	}
}

/**
 * Firestore onDocumentDeleted handler for statements/{statementId}.
 * Writes a tombstone to statementDeletions so clients with delta listeners
 * (which only see docs whose lastUpdate changed) learn about hard deletes.
 * Tombstones are purged by a Firestore TTL policy on `expireAt`.
 */
export async function writeStatementDeletionTombstone(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined, { statementId: string }>,
): Promise<void> {
	const deleted = event.data?.data() as Statement | undefined;
	if (!deleted) return;

	const { statementId } = event.params;

	try {
		const deletedAtMs = Date.now();
		const tombstone: StatementDeletion = {
			statementId,
			parentId: deleted.parentId,
			topParentId: deleted.topParentId,
			parents: deleted.parents ?? [],
			deletedAtMs,
		};

		await db
			.collection(Collections.statementDeletions)
			.doc(statementId)
			.set({
				...tombstone,
				expireAt: Timestamp.fromMillis(deletedAtMs + BULK_FETCH.TOMBSTONE_TTL_MS),
			});
	} catch (error) {
		logError(error, {
			operation: 'fn_bulkStatements.writeStatementDeletionTombstone',
			statementId,
		});
	}
}
