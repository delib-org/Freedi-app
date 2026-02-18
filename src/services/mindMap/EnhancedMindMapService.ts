import { Statement } from '@freedi/shared-types';
import { Unsubscribe } from 'firebase/firestore';
import { store } from '@/redux/store';
import { listenToMindMapData } from '@/controllers/db/statements/optimizedListeners';
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
import { createMindMapTreeSelector } from '@/redux/statements/mindMapSelectors';

/**
 * Enhanced Service for managing mind-map operations
 * Includes all business logic for mind-map functionality
 */
export class EnhancedMindMapService {
	private static instance: EnhancedMindMapService;
	private cache: Map<string, MindMapCacheEntry> = new Map();
	private activeListeners: Map<string, Unsubscribe[]> = new Map();
	private loadingStates: Map<string, MindMapLoadingState> = new Map();
	private retryTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private preloadQueue: Set<string> = new Set();
	private treeSelector = createMindMapTreeSelector();

	private constructor() {
		// Singleton
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
				const cached = this.getFromCache(statementId);
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
				this.addToCache(statementId, data);
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
		try {
			const data = await this.loadHierarchy(statementId);

			switch (format) {
				case 'json':
					return this.exportToJSON(data);
				case 'svg':
					return this.exportToSVG(data);
				case 'png':
					return this.exportToPNG(data);
				default:
					throw new Error(`Unsupported export format: ${format}`);
			}
		} catch (error) {
			logError(error, {
				operation: 'EnhancedMindMapService.exportMindMap',
				statementId,
				metadata: { format },
			});
			throw error;
		}
	}

	/**
	 * Export to JSON format
	 */
	private exportToJSON(data: MindMapData): Blob {
		const json = JSON.stringify(
			{
				rootId: data.rootStatement.statementId,
				title: data.rootStatement.statement,
				nodes: Array.from(data.nodeMap.values()).map((node) => ({
					id: node.statement.statementId,
					title: node.statement.statement,
					type: node.statement.statementType,
					depth: node.depth,
					parentId: node.statement.parentId,
				})),
				stats: {
					totalNodes: data.nodeMap.size,
					maxDepth: this.calculateMaxDepth(data.tree),
					exportDate: new Date().toISOString(),
				},
			},
			null,
			2,
		);

		return new Blob([json], { type: 'application/json' });
	}

	/**
	 * Export to SVG format (placeholder - needs actual implementation)
	 */
	private exportToSVG(data: MindMapData): Blob {
		// This would require rendering the mind-map to SVG
		// For now, return a placeholder
		const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <text x="400" y="300" text-anchor="middle">
          Mind Map: ${data.rootStatement.statement} (${data.nodeMap.size} nodes)
        </text>
      </svg>
    `;

		return new Blob([svg], { type: 'image/svg+xml' });
	}

	/**
	 * Export to PNG format (placeholder - needs actual implementation)
	 */
	private async exportToPNG(_data: MindMapData): Promise<Blob> {
		// This would require rendering the mind-map to canvas and converting to PNG
		// For now, throw an error indicating it needs implementation
		throw new Error('PNG export requires canvas rendering implementation');
	}

	/**
	 * Validate mind-map hierarchy
	 */
	public async validateHierarchy(statementId: string): Promise<ValidationResult> {
		try {
			const data = await this.loadHierarchy(statementId);
			const issues: ValidationIssue[] = [];

			// Check for circular references
			const visited = new Set<string>();
			const checkCircular = (node: MindMapNode, path: string[] = []) => {
				if (path.includes(node.statement.statementId)) {
					issues.push({
						type: 'circular_reference',
						statementId: node.statement.statementId,
						message: `Circular reference detected: ${path.join(' -> ')} -> ${node.statement.statementId}`,
					});

					return;
				}

				visited.add(node.statement.statementId);
				const newPath = [...path, node.statement.statementId];

				node.children.forEach((child) => {
					checkCircular(child, newPath);
				});
			};

			checkCircular(data.tree);

			// Check for orphaned nodes
			data.allStatements.forEach((stmt) => {
				if (stmt.parentId && !data.nodeMap.has(stmt.parentId)) {
					issues.push({
						type: 'orphaned_node',
						statementId: stmt.statementId,
						message: `Node has non-existent parent: ${stmt.parentId}`,
					});
				}
			});

			// Check for depth violations
			const maxDepthViolations = this.findDepthViolations(data.tree, MINDMAP_CONFIG.TREE.MAX_DEPTH);

			issues.push(...maxDepthViolations);

			return {
				isValid: issues.length === 0,
				issues,
				stats: {
					totalNodes: data.nodeMap.size,
					maxDepth: this.calculateMaxDepth(data.tree),
					orphanedNodes: issues.filter((i) => i.type === 'orphaned_node').length,
					circularReferences: issues.filter((i) => i.type === 'circular_reference').length,
				},
			};
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
						message: 'Failed to validate hierarchy',
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
	 * Find depth violations in tree
	 */
	private findDepthViolations(
		node: MindMapNode,
		maxDepth: number,
		issues: ValidationIssue[] = [],
	): ValidationIssue[] {
		if (node.depth > maxDepth) {
			issues.push({
				type: 'depth_violation',
				statementId: node.statement.statementId,
				message: `Node exceeds maximum depth: ${node.depth} > ${maxDepth}`,
			});
		}

		node.children.forEach((child) => {
			this.findDepthViolations(child, maxDepth, issues);
		});

		return issues;
	}

	/**
	 * Initialize preloader for smart pre-loading
	 */
	private initializePreloader(): void {
		// Process preload queue periodically
		setInterval(() => {
			this.processPreloadQueue();
		}, 5000);
	}

	/**
	 * Preload related statements
	 */
	private preloadRelated(currentId: string, statements: Statement[]): void {
		// Find statements that are likely to be accessed next
		statements.forEach((stmt) => {
			// Preload parent statements
			if (stmt.parentId && stmt.parentId !== currentId) {
				this.preloadQueue.add(stmt.parentId);
			}

			// Preload sibling statements
			if (stmt.topParentId && stmt.topParentId !== currentId) {
				this.preloadQueue.add(stmt.topParentId);
			}
		});
	}

	/**
	 * Process preload queue
	 */
	private async processPreloadQueue(): Promise<void> {
		if (this.preloadQueue.size === 0) return;

		const toPreload = Array.from(this.preloadQueue).slice(0, 3);
		this.preloadQueue.clear();

		for (const statementId of toPreload) {
			try {
				// Check if already cached
				if (this.cache.has(statementId)) continue;

				// Load in background
				await this.loadHierarchy(statementId, { useCache: true });

				console.info(`[EnhancedMindMapService] Preloaded statement: ${statementId}`);
			} catch {
				// Silent fail for preloading
				console.info(`[EnhancedMindMapService] Failed to preload: ${statementId}`);
			}
		}
	}

	/**
	 * Log performance metrics
	 */
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

		// Could send to analytics service here
	}

	/**
	 * Get cache statistics
	 */
	public getCacheStats(): CacheStats {
		let totalSize = 0;
		let oldestEntry = Date.now();
		let newestEntry = 0;

		this.cache.forEach((entry) => {
			totalSize += JSON.stringify(entry.data).length;
			if (entry.timestamp < oldestEntry) {
				oldestEntry = entry.timestamp;
			}
			if (entry.timestamp > newestEntry) {
				newestEntry = entry.timestamp;
			}
		});

		return {
			entries: this.cache.size,
			totalSizeBytes: totalSize,
			oldestEntryAge: Date.now() - oldestEntry,
			newestEntryAge: Date.now() - newestEntry,
			hitRate: this.calculateCacheHitRate(),
		};
	}

	/**
	 * Calculate cache hit rate
	 */
	private cacheHits = 0;
	private cacheMisses = 0;

	private calculateCacheHitRate(): number {
		const total = this.cacheHits + this.cacheMisses;

		return total > 0 ? (this.cacheHits / total) * 100 : 0;
	}

	/**
	 * Get data from cache
	 */
	private getFromCache(statementId: string): MindMapData | null {
		const entry = this.cache.get(statementId);

		if (!entry) {
			this.cacheMisses++;

			return null;
		}

		// Check if cache is still valid
		const age = Date.now() - entry.timestamp;
		if (age > MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL) {
			this.cache.delete(statementId);
			this.cacheMisses++;

			return null;
		}

		this.cacheHits++;

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

		// Also limit cache size
		if (this.cache.size > 50) {
			// Remove oldest entries
			const entries = Array.from(this.cache.entries()).sort(
				(a, b) => a[1].timestamp - b[1].timestamp,
			);

			for (let i = 0; i < entries.length - 30; i++) {
				this.cache.delete(entries[i][0]);
			}
		}
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
	 * Calculate maximum depth of tree
	 */
	private calculateMaxDepth(node: MindMapNode): number {
		if (node.children.length === 0) {
			return node.depth;
		}

		return Math.max(...node.children.map((child) => this.calculateMaxDepth(child)));
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

		console.info(`[EnhancedMindMapService] Retrying load (attempt ${attempt}) after ${delay}ms`);

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
		this.preloadQueue.clear();

		this.activeListeners.forEach((listeners, statementId) => {
			this.cleanupListeners(statementId);
		});

		this.retryTimeouts.forEach((timeout) => {
			clearTimeout(timeout);
		});
		this.retryTimeouts.clear();

		// Reset cache statistics
		this.cacheHits = 0;
		this.cacheMisses = 0;
	}

	/**
	 * Get current loading state for a statement
	 */
	public getLoadingState(statementId: string): MindMapLoadingState {
		return this.loadingStates.get(statementId) || MindMapLoadingState.IDLE;
	}
}

// Types
interface ValidationResult {
	isValid: boolean;
	issues: ValidationIssue[];
	stats: {
		totalNodes: number;
		maxDepth: number;
		orphanedNodes: number;
		circularReferences: number;
	};
}

interface ValidationIssue {
	type: 'circular_reference' | 'orphaned_node' | 'depth_violation' | 'validation_error';
	statementId: string;
	message: string;
}

interface CacheStats {
	entries: number;
	totalSizeBytes: number;
	oldestEntryAge: number;
	newestEntryAge: number;
	hitRate: number;
}

// Export singleton instance
export const enhancedMindMapService = EnhancedMindMapService.getInstance();
