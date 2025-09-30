/**
 * ListenerManager - Manages Firestore listeners to prevent duplicates and ensure proper cleanup
 *
 * This class helps prevent Firestore internal state errors by:
 * 1. Preventing duplicate listeners for the same resource
 * 2. Managing lifecycle properly
 * 3. Providing clean unsubscribe functionality
 * 4. Tracking document counts and query statistics
 */

interface ListenerStats {
	documentCount: number;
	lastUpdate: number;
	updateCount: number;
}

interface ListenerInfo {
	unsubscribe: () => void;
	stats: ListenerStats;
	type?: 'collection' | 'document' | 'query';
}

export class ListenerManager {
	private static instance: ListenerManager;
	private listeners = new Map<string, ListenerInfo>();
	private pendingListeners = new Set<string>();
	private totalDocumentsFetched = 0;
	private totalUpdates = 0;
	private debugMode = false;

	private constructor() {
		// Singleton pattern
		this.logStats = this.logStats.bind(this);
		// Removed automatic logging - will only log when explicitly requested
	}

	/**
	 * Enable or disable debug mode for console logging
	 */
	public setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	/**
	 * Check if debug logging is enabled
	 */
	private shouldLog(): boolean {
		return this.debugMode;
	}

	/**
	 * Get the singleton instance of ListenerManager
	 */
	public static getInstance(): ListenerManager {
		if (!ListenerManager.instance) {
			ListenerManager.instance = new ListenerManager();
		}

		return ListenerManager.instance;
	}

	/**
	 * Add a listener with a unique key and optional document counting
	 * @param key Unique identifier for the listener
	 * @param setupFn Function that sets up the listener and returns an unsubscribe function
	 * @param options Options for the listener including type and document count callback
	 * @returns true if listener was added, false if it already exists
	 */
	public async addListener(
		key: string,
		setupFn: (onDocumentCount?: (count: number) => void) => (() => void) | Promise<() => void>,
		options?: {
			type?: 'collection' | 'document' | 'query';
		}
	): Promise<boolean> {
		// Check if listener already exists or is being set up
		if (this.listeners.has(key) || this.pendingListeners.has(key)) {
			// Silent skip - no console output
			return false;
		}

		try {
			// Mark as pending to prevent duplicate setup attempts
			this.pendingListeners.add(key);

			// Create stats for this listener
			const stats: ListenerStats = {
				documentCount: 0,
				lastUpdate: Date.now(),
				updateCount: 0
			};

			// Document count callback
			const onDocumentCount = (count: number) => {
				stats.documentCount = count;
				stats.lastUpdate = Date.now();
				stats.updateCount++;
				this.totalDocumentsFetched += count;
				this.totalUpdates++;
			};

			// Setup the listener with document counting
			const unsubscribe = await setupFn(onDocumentCount);

			// Store the listener info
			this.listeners.set(key, {
				unsubscribe,
				stats,
				type: options?.type
			});

			// Remove from pending
			this.pendingListeners.delete(key);

			// Silent success - no console output

			return true;
		} catch (error) {
			console.error(`Error setting up listener '${key}':`, error);
			this.pendingListeners.delete(key);

			return false;
		}
	}

	/**
	 * Remove a specific listener
	 * @param key Unique identifier for the listener
	 * @returns true if listener was removed, false if it didn't exist
	 */
	public removeListener(key: string): boolean {
		const listenerInfo = this.listeners.get(key);
		if (listenerInfo) {
			try {
				listenerInfo.unsubscribe();
				this.listeners.delete(key);
				// Silent removal - no console output

				return true;
			} catch (error) {
				console.error(`Error removing listener '${key}':`, error);
				// Still remove from map even if unsubscribe failed
				this.listeners.delete(key);

				return false;
			}
		}

		return false;
	}

	/**
	 * Remove all listeners matching a pattern
	 * @param pattern Regular expression or string prefix to match keys
	 */
	public removeMatchingListeners(pattern: string | RegExp): number {
		let removed = 0;
		const regex = typeof pattern === 'string'
			? new RegExp(`^${pattern}`)
			: pattern;

		for (const [key] of this.listeners) {
			if (regex.test(key)) {
				if (this.removeListener(key)) {
					removed++;
				}
			}
		}

		return removed;
	}

	/**
	 * Check if a listener exists
	 * @param key Unique identifier for the listener
	 */
	public hasListener(key: string): boolean {
		return this.listeners.has(key) || this.pendingListeners.has(key);
	}

	/**
	 * Get the count of active listeners
	 */
	public getActiveListenerCount(): number {
		return this.listeners.size;
	}

	/**
	 * Get all active listener keys
	 */
	public getActiveListenerKeys(): string[] {
		return Array.from(this.listeners.keys());
	}

	/**
	 * Remove all listeners
	 */
	public removeAllListeners(): void {
		for (const [key] of this.listeners) {
			this.removeListener(key);
		}
	}

	/**
	 * Clean up listeners for a specific statement
	 * @param statementId The statement ID to clean up listeners for
	 */
	public cleanupStatementListeners(statementId: string): void {
		const removed = this.removeMatchingListeners(`statement-${statementId}`);
		if (removed > 0 && this.shouldLog()) {
			console.info(`Cleaned up ${removed} listeners for statement ${statementId}`);
		}
	}

	/**
	 * Clean up listeners for a specific user
	 * @param userId The user ID to clean up listeners for
	 */
	public cleanupUserListeners(userId: string): void {
		const removed = this.removeMatchingListeners(`user-${userId}`);
		if (removed > 0 && this.shouldLog()) {
			console.info(`Cleaned up ${removed} listeners for user ${userId}`);
		}
	}

	/**
	 * Get statistics for a specific listener
	 * @param key Unique identifier for the listener
	 */
	public getListenerStats(key: string): ListenerStats | null {
		const listener = this.listeners.get(key);
		
return listener ? { ...listener.stats } : null;
	}

	/**
	 * Get overall statistics for all listeners
	 */
	public getOverallStats() {
		const stats = {
			activeListeners: this.listeners.size,
			totalDocumentsFetched: this.totalDocumentsFetched,
			totalUpdates: this.totalUpdates,
			averageDocsPerUpdate: this.totalUpdates > 0
				? Math.round(this.totalDocumentsFetched / this.totalUpdates)
				: 0,
			listenerBreakdown: {
				collection: 0,
				document: 0,
				query: 0,
				unknown: 0
			},
			topListeners: [] as Array<{
				key: string;
				documentCount: number;
				updateCount: number;
				type?: string;
			}>
		};

		// Calculate breakdown and collect listener details
		const listenerDetails: Array<{
			key: string;
			documentCount: number;
			updateCount: number;
			type?: string;
		}> = [];

		for (const [key, info] of this.listeners) {
			const type = info.type || 'unknown';
			stats.listenerBreakdown[type as keyof typeof stats.listenerBreakdown]++;

			listenerDetails.push({
				key,
				documentCount: info.stats.documentCount,
				updateCount: info.stats.updateCount,
				type: info.type
			});
		}

		// Sort by document count and get top 10
		stats.topListeners = listenerDetails
			.sort((a, b) => b.documentCount - a.documentCount)
			.slice(0, 10);

		return stats;
	}

	/**
	 * Log current statistics
	 */
	public logStats(): void {
		const stats = this.getOverallStats();
		console.info('=== ListenerManager Statistics ===');
		console.info(`Active Listeners: ${stats.activeListeners}`);
		console.info(`Total Documents Fetched: ${stats.totalDocumentsFetched}`);
		console.info(`Total Updates: ${stats.totalUpdates}`);
		console.info(`Average Docs/Update: ${stats.averageDocsPerUpdate}`);
		console.info(`Breakdown: Collections: ${stats.listenerBreakdown.collection}, Documents: ${stats.listenerBreakdown.document}, Queries: ${stats.listenerBreakdown.query}`);

		if (stats.topListeners.length > 0) {
			console.info('Top Listeners by Document Count:');
			stats.topListeners.forEach((listener, index) => {
				console.info(`  ${index + 1}. ${listener.key}: ${listener.documentCount} docs in ${listener.updateCount} updates`);
			});
		}
		console.info('================================');
	}

	/**
	 * Reset all statistics (useful for testing)
	 */
	public resetStats(): void {
		this.totalDocumentsFetched = 0;
		this.totalUpdates = 0;
		for (const [, info] of this.listeners) {
			info.stats.documentCount = 0;
			info.stats.updateCount = 0;
			info.stats.lastUpdate = Date.now();
		}
	}
}

// Export singleton instance for convenience
export const listenerManager = ListenerManager.getInstance();