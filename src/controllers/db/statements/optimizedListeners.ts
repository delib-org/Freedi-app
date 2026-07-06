import { Unsubscribe } from 'firebase/auth';
import {
	and,
	collection,
	or,
	query,
	where,
	orderBy,
	limit,
	DocumentData,
	QuerySnapshot,
} from 'firebase/firestore';
import { Statement, StatementType, StatementSchema } from '@freedi/shared-types';
import { parse, safeParse } from 'valibot';
import { normalizeStatementData } from '@/helpers/timestampHelpers';
import { FireStore } from '../config';
import { Collections } from '@freedi/shared-types';
import { store } from '@/redux/store';
import { setStatement, setStatements, deleteStatement } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';
import { MINDMAP_CONFIG } from '@/constants/mindMap';
import {
	createManagedCollectionListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';

/**
 * Coerce a required-number field that arrived as null/undefined to 0, following
 * a valibot issue path. Walks object keys only; bails if the path doesn't match
 * a live object so a malformed path can never throw.
 */
function setPathToZero(
	target: Record<string, unknown>,
	path: ReadonlyArray<{ key?: unknown }>,
): void {
	if (!Array.isArray(path) || path.length === 0) return;
	let node: Record<string, unknown> = target;
	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i]?.key;
		if (typeof key !== 'string' && typeof key !== 'number') return;
		const next = node[key as string];
		if (next === null || typeof next !== 'object') return;
		node = next as Record<string, unknown>;
	}
	const last = path[path.length - 1]?.key;
	if (typeof last === 'string' || typeof last === 'number') {
		node[last as string] = 0;
	}
}

/**
 * Normalize + parse a raw statement doc, tolerant of legacy/synth production
 * data. Some older docs store a required numeric field (e.g. evaluation.agreement
 * or evaluation.numberOfEvaluators) as null; StatementSchema declares those as
 * number(), so a strict parse would drop the whole doc from the map. When that
 * happens we coerce every required-number field that came in as null/undefined
 * to 0 — the same neutral default normalizeStatementData already applies to
 * consensus/timestamps — and re-parse. If it still fails, we throw so the caller
 * logs and skips that single doc (unchanged behavior).
 */
function parseStatement(raw: unknown): Statement {
	const normalized = normalizeStatementData(raw);
	const result = safeParse(StatementSchema, normalized);
	if (result.success) return result.output;

	if (normalized && typeof normalized === 'object') {
		let coerced = false;
		for (const issue of result.issues) {
			if (
				issue.expected === 'number' &&
				(issue.received === 'null' || issue.received === 'undefined') &&
				Array.isArray(issue.path)
			) {
				setPathToZero(normalized as Record<string, unknown>, issue.path);
				coerced = true;
			}
		}
		if (coerced) {
			const retry = safeParse(StatementSchema, normalized);
			if (retry.success) return retry.output;
		}
	}

	// Still invalid after coercion — throw so the caller logs + skips this doc.
	return parse(StatementSchema, normalized);
}

/**
 * Consolidated listener for mind-map data
 * Replaces dual listeners with a single efficient query
 */
export function listenToMindMapData(statementId: string): Unsubscribe {
	try {
		const statementsRef = collection(FireStore, Collections.statements);

		// Maximum number of documents to load for performance
		const MAX_MINDMAP_DOCUMENTS = 200;

		// Single comprehensive query that gets everything we need
		const q = query(
			statementsRef,
			or(
				// Get the root statement itself
				where('statementId', '==', statementId),
				// Get all descendants via parents array
				and(
					where('parents', 'array-contains', statementId),
					or(
						where('statementType', '==', StatementType.question),
						where('statementType', '==', StatementType.group),
						where('statementType', '==', StatementType.option),
					),
				),
				// Get direct children via parentId (backup for missing parents array)
				and(
					where('parentId', '==', statementId),
					or(
						where('statementType', '==', StatementType.question),
						where('statementType', '==', StatementType.group),
						where('statementType', '==', StatementType.option),
					),
				),
			),
			orderBy('createdAt', 'desc'),
			limit(MAX_MINDMAP_DOCUMENTS),
		);

		const listenerKey = generateListenerKey('mindmap-consolidated', 'statement', statementId);

		// Performance tracking
		let loadedCount = 0;
		let isFirstBatch = true;
		const startTime = Date.now();

		const unsubscribeMain = createManagedCollectionListener(
			q,
			listenerKey,
			(snapshot: QuerySnapshot<DocumentData>) => {
				try {
					if (isFirstBatch) {
						// Process initial batch all at once for performance
						const validStatements: Statement[] = [];

						snapshot.forEach((doc) => {
							try {
								const data = doc.data();
								const statement = parseStatement(data);
								validStatements.push(statement);
								loadedCount++;
							} catch (error) {
								logError(error, {
									operation: 'listenToMindMapData.parseInitial',
									statementId: doc.id,
									metadata: {
										parentStatementId: statementId,
										loadedCount,
									},
								});
							}
						});

						// Batch dispatch for better performance
						if (validStatements.length > 0) {
							// Process in chunks for very large datasets
							const chunkSize = MINDMAP_CONFIG.QUERIES.BATCH_SIZE;
							for (let i = 0; i < validStatements.length; i += chunkSize) {
								const chunk = validStatements.slice(i, i + chunkSize);
								store.dispatch(setStatements(chunk));
							}

							const loadTime = Date.now() - startTime;
							console.info(`[listenToMindMapData] Initial load complete:`, {
								statementId,
								loadedCount: validStatements.length,
								loadTimeMs: loadTime,
								performanceScore:
									loadTime < 1000 ? 'Excellent' : loadTime < 3000 ? 'Good' : 'Needs optimization',
							});
						}

						isFirstBatch = false;
					} else {
						// Process incremental changes individually
						const changes = snapshot.docChanges();

						changes.forEach((change) => {
							try {
								const data = change.doc.data();
								const statement = parseStatement(data);

								switch (change.type) {
									case 'added':
									case 'modified':
										store.dispatch(setStatement(statement));
										break;
									case 'removed':
										store.dispatch(deleteStatement(statement.statementId));
										break;
								}
							} catch (error) {
								logError(error, {
									operation: 'listenToMindMapData.processChange',
									statementId: change.doc.id,
									metadata: {
										parentStatementId: statementId,
										changeType: change.type,
										loadedCount,
									},
								});
							}
						});
					}
				} catch (error) {
					logError(error, {
						operation: 'listenToMindMapData.snapshot',
						metadata: {
							statementId,
							loadedCount,
							isFirstBatch,
						},
					});
				}
			},
			(error) => {
				logError(error, {
					operation: 'listenToMindMapData.listener',
					metadata: {
						parentStatementId: statementId,
						loadedCount,
					},
				});
			},
			'query',
		);

		// Cluster docs (isCluster options) are created by synthesis and can be
		// OLDER than a burst of new responses, so the newest-200 window above can
		// evict them — orphaning every member into "Ungrouped" (T0.3). Load the
		// (few) cluster docs with a dedicated listener so they are always present,
		// regardless of how many responses the question accumulates.
		const unsubscribeClusters = listenToMindMapClusters(statementId);

		return (): void => {
			unsubscribeMain();
			unsubscribeClusters();
		};
	} catch (error) {
		logError(error, {
			operation: 'listenToMindMapData.setup',
			metadata: { parentStatementId: statementId },
		});

		return (): void => {
			// No-op unsubscribe
		};
	}
}

/**
 * Dedicated listener for a question's cluster docs (isCluster options), which
 * all live flat under the question (`parentId === questionId`). The main
 * mind-map listener caps at the newest 200 descendants, so on busy questions the
 * older cluster docs can fall out of that window and disappear — leaving their
 * members with no cluster to nest under, so they all render as "Ungrouped".
 * Clusters are few (tens at most), so loading them unconditionally is cheap and
 * guarantees the board can always group its notes.
 */
function listenToMindMapClusters(statementId: string): Unsubscribe {
	try {
		const statementsRef = collection(FireStore, Collections.statements);

		// Clusters are few; this bound only guards against a pathological case.
		const MAX_CLUSTER_DOCUMENTS = 500;

		// Two equality filters + limit (no orderBy) — served by single-field
		// indexes via zigzag merge join, so no composite index is required.
		const q = query(
			statementsRef,
			and(where('parentId', '==', statementId), where('isCluster', '==', true)),
			limit(MAX_CLUSTER_DOCUMENTS),
		);

		const listenerKey = generateListenerKey('mindmap-clusters', 'statement', statementId);

		return createManagedCollectionListener(
			q,
			listenerKey,
			(snapshot: QuerySnapshot<DocumentData>) => {
				// docChanges reports every doc as 'added' on the first snapshot, so
				// this covers both the initial load and subsequent updates.
				snapshot.docChanges().forEach((change) => {
					try {
						const statement = parseStatement(change.doc.data());

						switch (change.type) {
							case 'added':
							case 'modified':
								store.dispatch(setStatement(statement));
								break;
							case 'removed':
								store.dispatch(deleteStatement(statement.statementId));
								break;
						}
					} catch (error) {
						logError(error, {
							operation: 'listenToMindMapClusters.processChange',
							statementId: change.doc.id,
							metadata: { parentStatementId: statementId, changeType: change.type },
						});
					}
				});
			},
			(error) => {
				logError(error, {
					operation: 'listenToMindMapClusters.listener',
					metadata: { parentStatementId: statementId },
				});
			},
			'query',
		);
	} catch (error) {
		logError(error, {
			operation: 'listenToMindMapClusters.setup',
			metadata: { parentStatementId: statementId },
		});

		return (): void => {
			// No-op unsubscribe
		};
	}
}

/**
 * Optimized listener for statement updates with caching
 */
export class OptimizedStatementListener {
	private static instance: OptimizedStatementListener;
	private cache: Map<string, { statement: Statement; timestamp: number }> = new Map();
	private listeners: Map<string, Unsubscribe> = new Map();

	private constructor() {
		// Singleton
	}

	public static getInstance(): OptimizedStatementListener {
		if (!OptimizedStatementListener.instance) {
			OptimizedStatementListener.instance = new OptimizedStatementListener();
		}

		return OptimizedStatementListener.instance;
	}

	/**
	 * Subscribe to statement with caching
	 */
	public subscribe(statementId: string): Unsubscribe {
		// Check cache first
		const cached = this.cache.get(statementId);
		if (cached && Date.now() - cached.timestamp < MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL) {
			// Use cached data
			store.dispatch(setStatement(cached.statement));

			// Set up listener for future updates
			return this.createListener(statementId);
		}

		// No cache or expired, create new listener
		return this.createListener(statementId);
	}

	/**
	 * Create optimized listener
	 */
	private createListener(statementId: string): Unsubscribe {
		// Check if listener already exists
		if (this.listeners.has(statementId)) {
			console.info(`[OptimizedStatementListener] Reusing existing listener for ${statementId}`);

			return () => this.unsubscribe(statementId);
		}

		const unsubscribe = listenToMindMapData(statementId);
		this.listeners.set(statementId, unsubscribe);

		return () => this.unsubscribe(statementId);
	}

	/**
	 * Unsubscribe and cleanup
	 */
	private unsubscribe(statementId: string): void {
		const listener = this.listeners.get(statementId);
		if (listener) {
			listener();
			this.listeners.delete(statementId);
		}
	}

	/**
	 * Update cache
	 */
	public updateCache(statement: Statement): void {
		this.cache.set(statement.statementId, {
			statement,
			timestamp: Date.now(),
		});

		// Clean old cache entries
		this.cleanCache();
	}

	/**
	 * Clean expired cache entries
	 */
	private cleanCache(): void {
		const now = Date.now();
		const maxAge = MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL;

		this.cache.forEach((entry, key) => {
			if (now - entry.timestamp > maxAge) {
				this.cache.delete(key);
			}
		});
	}

	/**
	 * Clear all listeners and cache
	 */
	public clearAll(): void {
		this.listeners.forEach((unsubscribe) => unsubscribe());
		this.listeners.clear();
		this.cache.clear();
	}
}

// Export singleton instance
export const optimizedListener = OptimizedStatementListener.getInstance();
