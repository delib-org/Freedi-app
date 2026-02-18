import { Statement, StatementType } from '@freedi/shared-types';
import { Unsubscribe } from 'firebase/firestore';
import { store } from '@/redux/store';
import {
	listenToAllDescendants,
	listenToStatement,
} from '@/controllers/db/statements/listenToStatements';
import { logError } from '@/utils/errorHandling';
import { MINDMAP_CONFIG } from '@/constants/mindMap';
import {
	MindMapData,
	MindMapNode,
	MindMapLoadOptions,
	MindMapUpdateCallback,
	MindMapLoadingState,
	MindMapError,
	MindMapStats,
	MindMapCacheEntry,
} from './types';

/**
 * Service for managing mind-map data loading and tree building
 */
export class MindMapService {
	private static instance: MindMapService;
	private cache: Map<string, MindMapCacheEntry> = new Map();
	private activeListeners: Map<string, Unsubscribe[]> = new Map();
	private loadingStates: Map<string, MindMapLoadingState> = new Map();
	private retryTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

	private constructor() {
		// Singleton
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): MindMapService {
		if (!MindMapService.instance) {
			MindMapService.instance = new MindMapService();
		}

		return MindMapService.instance;
	}

	/**
	 * Load complete hierarchy for a statement
	 */
	public async loadHierarchy(
		statementId: string,
		options: MindMapLoadOptions = {},
	): Promise<MindMapData> {
		const {
			useCache = true,
			retryOnError = true,
			maxDepth = MINDMAP_CONFIG.TREE.MAX_DEPTH,
		} = options;

		try {
			// Check cache first
			if (useCache) {
				const cached = this.getFromCache(statementId);
				if (cached) {
					console.info(`[MindMapService] Loaded from cache: ${statementId}`);

					return cached;
				}
			}

			// Set loading state
			this.loadingStates.set(statementId, MindMapLoadingState.LOADING);

			// Load data from Redux store
			const startTime = Date.now();
			const state = store.getState();

			// Get root statement
			const rootStatement = state.statements.statements.find((s) => s.statementId === statementId);

			if (!rootStatement) {
				throw this.createError('STATEMENT_NOT_FOUND', `Statement ${statementId} not found`, false);
			}

			// Get all descendants
			const allDescendants = state.statements.statements.filter((s) =>
				s.parents?.includes(statementId),
			);

			// Build optimized tree structure
			const tree = this.buildOptimizedTree(rootStatement, allDescendants, maxDepth);

			// Create node map for quick lookups
			const nodeMap = new Map<string, MindMapNode>();
			this.populateNodeMap(tree, nodeMap);

			// Calculate stats
			const loadTime = Date.now() - startTime;
			const stats: MindMapStats = {
				totalNodes: nodeMap.size,
				maxDepth: this.calculateMaxDepth(tree),
				loadTime,
				cacheHit: false,
				errorCount: 0,
			};

			// Create mind-map data
			const data: MindMapData = {
				rootStatement,
				tree,
				allStatements: [rootStatement, ...allDescendants],
				nodeMap,
				loadingState: MindMapLoadingState.FULLY_LOADED,
			};

			// Cache the result
			if (useCache) {
				this.addToCache(statementId, data);
			}

			// Update loading state
			this.loadingStates.set(statementId, MindMapLoadingState.FULLY_LOADED);

			console.info(`[MindMapService] Loaded hierarchy in ${loadTime}ms:`, stats);

			return data;
		} catch (error) {
			logError(error, {
				operation: 'MindMapService.loadHierarchy',
				statementId,
				metadata: { options },
			});

			// Update loading state
			this.loadingStates.set(statementId, MindMapLoadingState.ERROR);

			// Retry if enabled
			if (retryOnError) {
				return this.retryLoad(statementId, options);
			}

			throw error;
		}
	}

	/**
	 * Subscribe to real-time updates for a mind-map
	 */
	public subscribeToUpdates(
		statementId: string,
		callback: MindMapUpdateCallback,
		options: MindMapLoadOptions = {},
	): Unsubscribe {
		try {
			// Clean up any existing listeners
			this.cleanupListeners(statementId);

			// Set up new listeners
			const listeners: Unsubscribe[] = [
				listenToStatement(statementId),
				listenToAllDescendants(statementId),
			];

			// Store listeners
			this.activeListeners.set(statementId, listeners);

			// Set up periodic updates
			const updateInterval = setInterval(async () => {
				try {
					const data = await this.loadHierarchy(statementId, options);
					callback(data);
				} catch (error) {
					logError(error, {
						operation: 'MindMapService.subscribeToUpdates.interval',
						statementId,
					});
				}
			}, MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL);

			// Return unsubscribe function
			return () => {
				clearInterval(updateInterval);
				this.cleanupListeners(statementId);
			};
		} catch (error) {
			logError(error, {
				operation: 'MindMapService.subscribeToUpdates',
				statementId,
			});

			return () => {
				// No-op
			};
		}
	}

	/**
	 * Build optimized tree structure using O(n) algorithm
	 */
	private buildOptimizedTree(
		rootStatement: Statement,
		allStatements: Statement[],
		maxDepth: number,
	): MindMapNode {
		// Create a map for O(1) lookups
		const statementMap = new Map<string, Statement>();
		const childrenMap = new Map<string, Statement[]>();

		// First pass: build maps
		allStatements.forEach((stmt) => {
			statementMap.set(stmt.statementId, stmt);

			// Build parent-child relationships
			if (stmt.parentId) {
				const siblings = childrenMap.get(stmt.parentId) || [];
				siblings.push(stmt);
				childrenMap.set(stmt.parentId, siblings);
			}
		});

		// Add root to map
		statementMap.set(rootStatement.statementId, rootStatement);

		// Second pass: build tree recursively
		const buildNode = (statement: Statement, depth: number = 0): MindMapNode => {
			// Prevent infinite loops
			if (depth > maxDepth) {
				return {
					statement,
					children: [],
					depth,
				};
			}

			// Get children for this node
			const children = childrenMap.get(statement.statementId) || [];

			// Filter and sort children by type and creation date
			const sortedChildren = children
				.filter((child) => this.isValidMindMapStatement(child))
				.sort((a, b) => {
					// Sort by type priority: questions > groups > options
					const typePriority = {
						[StatementType.question]: 0,
						[StatementType.group]: 1,
						[StatementType.option]: 2,
					};

					const aPriority = typePriority[a.statementType] ?? 3;
					const bPriority = typePriority[b.statementType] ?? 3;

					if (aPriority !== bPriority) {
						return aPriority - bPriority;
					}

					// Then sort by creation date
					return (a.createdAt || 0) - (b.createdAt || 0);
				});

			// Recursively build child nodes
			const childNodes = sortedChildren.map((child) => buildNode(child, depth + 1));

			return {
				statement,
				children: childNodes,
				depth,
				isExpanded: depth < 2, // Auto-expand first 2 levels
			};
		};

		return buildNode(rootStatement, 0);
	}

	/**
	 * Check if statement is valid for mind-map
	 */
	private isValidMindMapStatement(statement: Statement): boolean {
		return (
			statement.statementType === StatementType.question ||
			statement.statementType === StatementType.group ||
			statement.statementType === StatementType.option
		);
	}

	/**
	 * Populate node map for quick lookups
	 */
	private populateNodeMap(node: MindMapNode, map: Map<string, MindMapNode>): void {
		map.set(node.statement.statementId, node);
		node.children.forEach((child) => this.populateNodeMap(child, map));
	}

	/**
	 * Calculate maximum depth of tree
	 */
	private calculateMaxDepth(node: MindMapNode): number {
		if (node.children.length === 0) {
			return node.depth;
		}

		return Math.max(...node.children.map((child) => this.calculateMaxDepth(child)));
	}

	/**
	 * Get data from cache
	 */
	private getFromCache(statementId: string): MindMapData | null {
		const entry = this.cache.get(statementId);

		if (!entry) {
			return null;
		}

		// Check if cache is still valid
		const age = Date.now() - entry.timestamp;
		if (age > MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL) {
			this.cache.delete(statementId);

			return null;
		}

		return entry.data;
	}

	/**
	 * Add data to cache
	 */
	private addToCache(statementId: string, data: MindMapData): void {
		const entry: MindMapCacheEntry = {
			data,
			timestamp: Date.now(),
			statementId,
			version: 1,
		};

		this.cache.set(statementId, entry);

		// Clean up old cache entries
		this.cleanupCache();
	}

	/**
	 * Clean up old cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		const maxAge = MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL;

		this.cache.forEach((entry, key) => {
			if (now - entry.timestamp > maxAge) {
				this.cache.delete(key);
			}
		});
	}

	/**
	 * Clean up listeners for a statement
	 */
	private cleanupListeners(statementId: string): void {
		const listeners = this.activeListeners.get(statementId);
		if (listeners) {
			listeners.forEach((unsubscribe) => unsubscribe());
			this.activeListeners.delete(statementId);
		}

		// Clear retry timeout if exists
		const timeout = this.retryTimeouts.get(statementId);
		if (timeout) {
			clearTimeout(timeout);
			this.retryTimeouts.delete(statementId);
		}
	}

	/**
	 * Retry loading with exponential backoff
	 */
	private async retryLoad(
		statementId: string,
		options: MindMapLoadOptions,
		attempt: number = 1,
	): Promise<MindMapData> {
		if (attempt > MINDMAP_CONFIG.RETRY.MAX_ATTEMPTS) {
			throw this.createError(
				'MAX_RETRIES_EXCEEDED',
				`Failed to load mind-map after ${MINDMAP_CONFIG.RETRY.MAX_ATTEMPTS} attempts`,
				false,
			);
		}

		const delay = Math.min(
			MINDMAP_CONFIG.RETRY.INITIAL_DELAY *
				Math.pow(MINDMAP_CONFIG.RETRY.EXPONENTIAL_FACTOR, attempt - 1),
			MINDMAP_CONFIG.RETRY.MAX_DELAY,
		);

		console.info(`[MindMapService] Retrying load (attempt ${attempt}) after ${delay}ms`);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(async () => {
				try {
					const data = await this.loadHierarchy(statementId, {
						...options,
						retryOnError: false, // Prevent infinite recursion
					});
					resolve(data);
				} catch {
					// Try again
					this.retryLoad(statementId, options, attempt + 1)
						.then(resolve)
						.catch(reject);
				}
			}, delay);

			this.retryTimeouts.set(statementId, timeout);
		});
	}

	/**
	 * Create error object
	 */
	private createError(code: string, message: string, retryable: boolean): MindMapError {
		return {
			code,
			message,
			retryable,
		};
	}

	/**
	 * Clear all caches and listeners
	 */
	public clearAll(): void {
		this.cache.clear();
		this.loadingStates.clear();

		this.activeListeners.forEach((listeners, statementId) => {
			this.cleanupListeners(statementId);
		});

		this.retryTimeouts.forEach((timeout) => {
			clearTimeout(timeout);
		});
		this.retryTimeouts.clear();
	}

	/**
	 * Get current loading state for a statement
	 */
	public getLoadingState(statementId: string): MindMapLoadingState {
		return this.loadingStates.get(statementId) || MindMapLoadingState.IDLE;
	}
}

// Export singleton instance
export const mindMapService = MindMapService.getInstance();
