import { Statement } from '@freedi/shared-types';
import { Unsubscribe } from 'firebase/firestore';
import { store } from '@/redux/store';
import { listenToMindMapData } from '@/controllers/db/statements/optimizedListeners';
import { logError } from '@/utils/errorHandling';
import { MINDMAP_CONFIG } from '@/constants/mindMap';
import {
	MindMapData,
	MindMapLoadOptions,
	MindMapUpdateCallback,
	MindMapLoadingState,
	MindMapError,
	MindMapStats,
} from './types';
import { createMindMapTreeSelector } from '@/redux/statements/mindMapSelectors';
import { MindMapCache, CacheStats } from './mindMapCache';
import { validateHierarchy, ValidationResult } from './mindMapValidation';
import { exportMindMap } from './mindMapExport';

/**
 * Enhanced Service for managing mind-map operations
 * Acts as a facade over cache, validation, and export modules
 */
export class EnhancedMindMapService {
	private static instance: EnhancedMindMapService;
	private cache = new MindMapCache();
	private activeListeners: Map<string, Unsubscribe[]> = new Map();
	private loadingStates: Map<string, MindMapLoadingState> = new Map();
	private retryTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private preloadQueue: Set<string> = new Set();
	private treeSelector = createMindMapTreeSelector();

	private constructor() {
		this.initializePreloader();
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): EnhancedMindMapService {
		if (!EnhancedMindMapService.instance) {
			EnhancedMindMapService.instance = new EnhancedMindMapService();
		}

		return EnhancedMindMapService.instance;
	}

	/**
	 * Load complete hierarchy with enhanced features
	 */
	public async loadHierarchy(
		statementId: string,
		options: MindMapLoadOptions = {},
	): Promise<MindMapData> {
		const { useCache = true, retryOnError = true } = options;

		try {
			// Check cache first
			if (useCache) {
				const cached = this.cache.getFromCache(statementId);
				if (cached) {
					this.logPerformance('cache_hit', statementId, 0);

					return cached;
				}
			}

			// Set loading state
			this.loadingStates.set(statementId, MindMapLoadingState.LOADING);

			const startTime = performance.now();

			// Use optimized selector
			const state = store.getState();
			const treeData = this.treeSelector(state, statementId);

			if (!treeData || !treeData.tree) {
				throw this.createError(
					'STATEMENT_NOT_FOUND',
					`Statement ${statementId} not found or tree could not be built`,
					true,
				);
			}

			// Extract root statement from tree
			const rootStatement = treeData.tree.statement;

			// Get all statements from node map
			const allStatements: Statement[] = [];
			treeData.nodeMap.forEach((node) => {
				allStatements.push(node.statement);
			});

			// Calculate performance metrics
			const loadTime = performance.now() - startTime;
			const stats: MindMapStats = {
				totalNodes: treeData.totalNodes,
				maxDepth: treeData.maxDepth,
				loadTime,
				cacheHit: false,
				errorCount: 0,
			};

			// Create mind-map data
			const data: MindMapData = {
				rootStatement,
				tree: treeData.tree,
				allStatements,
				nodeMap: treeData.nodeMap,
				loadingState: MindMapLoadingState.FULLY_LOADED,
			};

			// Cache the result
			if (useCache) {
				this.cache.addToCache(statementId, data);
			}

			// Update loading state
			this.loadingStates.set(statementId, MindMapLoadingState.FULLY_LOADED);

			// Log performance
			this.logPerformance('load_complete', statementId, loadTime, stats);

			// Preload related statements
			this.preloadRelated(statementId, allStatements);

			return data;
		} catch (error) {
			logError(error, {
				operation: 'EnhancedMindMapService.loadHierarchy',
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
	 * Subscribe to real-time updates with enhanced features
	 */
	public subscribeToUpdates(
		statementId: string,
		callback: MindMapUpdateCallback,
		options: MindMapLoadOptions = {},
	): Unsubscribe {
		try {
			// Clean up any existing listeners
			this.cleanupListeners(statementId);

			// Use consolidated listener
			const unsubscribe = listenToMindMapData(statementId);

			// Store listener
			this.activeListeners.set(statementId, [unsubscribe]);

			// Set up update callback
			let updateTimer: ReturnType<typeof setTimeout> | null = null;

			const handleUpdate = async () => {
				try {
					const data = await this.loadHierarchy(statementId, options);
					callback(data);
				} catch (error) {
					logError(error, {
						operation: 'EnhancedMindMapService.handleUpdate',
						statementId,
					});
				}
			};

			// Debounce updates for performance
			const debouncedUpdate = () => {
				if (updateTimer) {
					clearTimeout(updateTimer);
				}
				updateTimer = setTimeout(handleUpdate, MINDMAP_CONFIG.PERFORMANCE.DEBOUNCE_DELAY);
			};

			// Subscribe to store changes
			const unsubscribeStore = store.subscribe(debouncedUpdate);

			// Return combined unsubscribe
			return () => {
				if (updateTimer) {
					clearTimeout(updateTimer);
				}
				unsubscribeStore();
				this.cleanupListeners(statementId);
			};
		} catch (error) {
			logError(error, {
				operation: 'EnhancedMindMapService.subscribeToUpdates',
				statementId,
			});

			return () => {
				// No-op
			};
		}
	}

	/**
	 * Export mind-map to various formats
	 */
	public async exportMindMap(statementId: string, format: 'json' | 'svg' | 'png'): Promise<Blob> {
		const data = await this.loadHierarchy(statementId);

		return exportMindMap(data, statementId, format);
	}

	/**
	 * Validate mind-map hierarchy
	 */
	public async validateHierarchy(statementId: string): Promise<ValidationResult> {
		try {
			const data = await this.loadHierarchy(statementId);

			return validateHierarchy(data, statementId);
		} catch (error) {
			logError(error, {
				operation: 'EnhancedMindMapService.validateHierarchy',
				statementId,
			});

			return {
				isValid: false,
				issues: [
					{
						type: 'validation_error',
						statementId,
						message: 'Failed to load hierarchy for validation',
					},
				],
				stats: {
					totalNodes: 0,
					maxDepth: 0,
					orphanedNodes: 0,
					circularReferences: 0,
				},
			};
		}
	}

	/**
	 * Get cache statistics
	 */
	public getCacheStats(): CacheStats {
		return this.cache.getCacheStats();
	}

	/**
	 * Clear all caches and listeners
	 */
	public clearAll(): void {
		this.cache.clear();
		this.loadingStates.clear();
		this.preloadQueue.clear();

		this.activeListeners.forEach((_listeners, statementId) => {
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

	// -- Private methods --

	private initializePreloader(): void {
		setInterval(() => {
			this.processPreloadQueue();
		}, 5000);
	}

	private preloadRelated(currentId: string, statements: Statement[]): void {
		statements.forEach((stmt) => {
			if (stmt.parentId && stmt.parentId !== currentId) {
				this.preloadQueue.add(stmt.parentId);
			}
			if (stmt.topParentId && stmt.topParentId !== currentId) {
				this.preloadQueue.add(stmt.topParentId);
			}
		});
	}

	private async processPreloadQueue(): Promise<void> {
		if (this.preloadQueue.size === 0) return;

		const toPreload = Array.from(this.preloadQueue).slice(0, 3);
		this.preloadQueue.clear();

		for (const statementId of toPreload) {
			try {
				if (this.cache.has(statementId)) continue;

				await this.loadHierarchy(statementId, { useCache: true });

				console.info(`[EnhancedMindMapService] Preloaded statement: ${statementId}`);
			} catch {
				console.info(`[EnhancedMindMapService] Failed to preload: ${statementId}`);
			}
		}
	}

	private logPerformance(
		action: string,
		statementId: string,
		duration: number,
		stats?: MindMapStats,
	): void {
		const metrics = {
			action,
			statementId,
			duration,
			...stats,
			timestamp: new Date().toISOString(),
		};

		console.info('[EnhancedMindMapService] Performance:', metrics);
	}

	private cleanupListeners(statementId: string): void {
		const listeners = this.activeListeners.get(statementId);
		if (listeners) {
			listeners.forEach((unsubscribe) => unsubscribe());
			this.activeListeners.delete(statementId);
		}

		const timeout = this.retryTimeouts.get(statementId);
		if (timeout) {
			clearTimeout(timeout);
			this.retryTimeouts.delete(statementId);
		}
	}

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

		console.info(`[EnhancedMindMapService] Retrying load (attempt ${attempt}) after ${delay}ms`);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(async () => {
				try {
					const data = await this.loadHierarchy(statementId, {
						...options,
						retryOnError: false,
					});
					resolve(data);
				} catch {
					this.retryLoad(statementId, options, attempt + 1)
						.then(resolve)
						.catch(reject);
				}
			}, delay);

			this.retryTimeouts.set(statementId, timeout);
		});
	}

	private createError(code: string, message: string, retryable: boolean): MindMapError {
		return {
			code,
			message,
			retryable,
		};
	}
}

// Export singleton instance
export const enhancedMindMapService = EnhancedMindMapService.getInstance();
