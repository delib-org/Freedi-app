import { Unsubscribe } from 'firebase/auth';
import {
	collection,
	getCountFromServer,
	orderBy,
	query,
	where,
	DocumentData,
	QuerySnapshot,
} from 'firebase/firestore';
import { parse } from 'valibot';
import { Collections, Statement, StatementSchema } from '@freedi/shared-types';
import { auth, FireStore } from '../config';
import { APIEndPoint } from '@/controllers/general/apiEndpoint';
import { normalizeStatementData } from '@/helpers/timestampHelpers';
import { store } from '@/redux/store';
import {
	BulkLoadMode,
	deleteStatement,
	setStatement,
	setStatements,
} from '@/redux/statements/statementsSlice';
import { logError, AuthenticationError, NetworkError } from '@/utils/errorHandling';
import { BULK_LOAD } from '@/constants/common';
import {
	createManagedCollectionListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';

interface BulkPageResponse {
	ok: boolean;
	statements: unknown[];
	nextCursor: string | null;
	serverTime: number;
	error?: string;
}

export interface BulkLoadResult {
	/** Number of statements loaded into the store */
	loaded: number;
	/** Delta-listener starting point: max lastUpdate seen minus a safety overlap */
	watermark: number;
}

/** Scope filter shared by the count query and the delta listeners. */
function scopeConstraint(rootId: string, mode: BulkLoadMode) {
	return mode === 'direct'
		? where('parentId', '==', rootId)
		: where('parents', 'array-contains', rootId);
}

/**
 * Counts the statements in a scope with a cheap aggregation query
 * (1 read per 1000 matched documents). Used by the "Showing X of N" banner.
 */
export async function getStatementsCount(rootId: string, mode: BulkLoadMode): Promise<number> {
	try {
		const q = query(collection(FireStore, Collections.statements), scopeConstraint(rootId, mode));
		const snapshot = await getCountFromServer(q);

		return snapshot.data().count;
	} catch (error) {
		logError(error, {
			operation: 'bulkLoadStatements.getStatementsCount',
			statementId: rootId,
			metadata: { mode },
		});

		return 0;
	}
}

/**
 * Loads ALL statements in a scope through the getBulkStatements HTTP endpoint,
 * page by page, dispatching each page into Redux as it arrives.
 * Returns the watermark from which delta listeners should start.
 */
export async function bulkLoadStatements(
	rootId: string,
	mode: BulkLoadMode,
	onProgress?: (loaded: number) => void,
): Promise<BulkLoadResult> {
	const idToken = await auth.currentUser?.getIdToken();
	if (!idToken) {
		throw new AuthenticationError('User not authenticated', {
			operation: 'bulkLoadStatements.bulkLoadStatements',
		});
	}

	let loaded = 0;
	let maxLastUpdate = 0;
	let cursor: string | null = null;

	do {
		const params: Record<string, string | number> = {
			rootId,
			mode,
			pageSize: BULK_LOAD.PAGE_SIZE,
		};
		if (cursor) params.cursor = cursor;

		const endPoint = APIEndPoint('getBulkStatements', params);
		const response = await fetch(endPoint, {
			headers: { Authorization: `Bearer ${idToken}` },
		});

		if (!response.ok) {
			throw new NetworkError(`getBulkStatements failed with status ${response.status}`, {
				operation: 'bulkLoadStatements.bulkLoadStatements',
				statementId: rootId,
				metadata: { mode, cursor, status: response.status },
			});
		}

		const page = (await response.json()) as BulkPageResponse;
		if (!page.ok) {
			throw new NetworkError(page.error || 'getBulkStatements returned an error', {
				operation: 'bulkLoadStatements.bulkLoadStatements',
				statementId: rootId,
				metadata: { mode, cursor },
			});
		}

		const validStatements: Statement[] = [];
		for (const raw of page.statements) {
			try {
				const statement = parse(StatementSchema, normalizeStatementData(raw as DocumentData));
				validStatements.push(statement);
				if (statement.lastUpdate > maxLastUpdate) maxLastUpdate = statement.lastUpdate;
			} catch (error) {
				logError(error, {
					operation: 'bulkLoadStatements.parsePage',
					statementId: rootId,
					metadata: { mode, loaded },
				});
			}
		}

		if (validStatements.length > 0) {
			store.dispatch(setStatements(validStatements));
		}

		loaded += validStatements.length;
		onProgress?.(loaded);
		cursor = page.nextCursor;
	} while (cursor);

	// Rewind the watermark to absorb the server response cache window and
	// writes that landed mid-load. Replays are idempotent via setStatement.
	const watermark = Math.max(0, maxLastUpdate - BULK_LOAD.DELTA_OVERLAP_MS);

	return { loaded, watermark };
}

/**
 * Real-time follow-up for a fully bulk-loaded scope.
 *
 * Instead of re-listening to the whole scope (which would re-read every
 * document), two narrow listeners stream only what changed after the
 * bulk-load watermark:
 *  1. statements with lastUpdate > watermark   → creates + edits
 *  2. statementDeletions with deletedAtMs > watermark → hard deletes
 *     (tombstones written by the onStatementDeletionTombstone function)
 *
 * Both start with an empty result set, so attaching them costs no reads.
 */
export function listenToStatementDeltas(
	rootId: string,
	mode: BulkLoadMode,
	sinceMs: number,
): Unsubscribe {
	try {
		const changesQuery = query(
			collection(FireStore, Collections.statements),
			scopeConstraint(rootId, mode),
			where('lastUpdate', '>', sinceMs),
			orderBy('lastUpdate', 'asc'),
		);

		const deletionsQuery = query(
			collection(FireStore, Collections.statementDeletions),
			scopeConstraint(rootId, mode),
			where('deletedAtMs', '>', sinceMs),
			orderBy('deletedAtMs', 'asc'),
		);

		const unsubscribeChanges = createManagedCollectionListener(
			changesQuery,
			generateListenerKey('bulk-delta-changes', mode, rootId),
			(snapshot: QuerySnapshot<DocumentData>) => {
				snapshot.docChanges().forEach((change) => {
					try {
						if (change.type === 'removed') {
							// Doc left the window (e.g. hard delete of an already-streamed doc)
							store.dispatch(deleteStatement(change.doc.id));

							return;
						}
						const statement = parse(StatementSchema, normalizeStatementData(change.doc.data()));
						store.dispatch(setStatement(statement));
					} catch (error) {
						logError(error, {
							operation: 'bulkLoadStatements.deltaChange',
							statementId: change.doc.id,
							metadata: { rootId, mode, changeType: change.type },
						});
					}
				});
			},
			(error) => {
				logError(error, {
					operation: 'bulkLoadStatements.deltaListener',
					statementId: rootId,
					metadata: { mode, sinceMs },
				});
			},
		);

		const unsubscribeDeletions = createManagedCollectionListener(
			deletionsQuery,
			generateListenerKey('bulk-delta-deletions', mode, rootId),
			(snapshot: QuerySnapshot<DocumentData>) => {
				snapshot.docChanges().forEach((change) => {
					if (change.type === 'added' || change.type === 'modified') {
						store.dispatch(deleteStatement(change.doc.id));
					}
				});
			},
			(error) => {
				logError(error, {
					operation: 'bulkLoadStatements.tombstoneListener',
					statementId: rootId,
					metadata: { mode, sinceMs },
				});
			},
		);

		return () => {
			unsubscribeChanges();
			unsubscribeDeletions();
		};
	} catch (error) {
		logError(error, {
			operation: 'bulkLoadStatements.listenToStatementDeltas',
			statementId: rootId,
			metadata: { mode, sinceMs },
		});

		return (): void => {
			// No-op unsubscribe
		};
	}
}
