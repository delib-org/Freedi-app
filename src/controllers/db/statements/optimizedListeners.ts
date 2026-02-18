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
import { parse } from 'valibot';
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

		return createManagedCollectionListener(
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
								const statement = parse(StatementSchema, normalizeStatementData(data));
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
								const statement = parse(StatementSchema, normalizeStatementData(data));

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
