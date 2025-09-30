/**
 * ListenerManager - Manages Firestore listeners to prevent duplicates and ensure proper cleanup
 *
 * This class helps prevent Firestore internal state errors by:
 * 1. Preventing duplicate listeners for the same resource
 * 2. Managing lifecycle properly
 * 3. Providing clean unsubscribe functionality
 */
export class ListenerManager {
	private static instance: ListenerManager;
	private listeners = new Map<string, () => void>();
	private pendingListeners = new Set<string>();

	private constructor() {
		// Singleton pattern
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
	 * Add a listener with a unique key
	 * @param key Unique identifier for the listener
	 * @param setupFn Function that sets up the listener and returns an unsubscribe function
	 * @returns true if listener was added, false if it already exists
	 */
	public async addListener(
		key: string,
		setupFn: () => (() => void) | Promise<() => void>
	): Promise<boolean> {
		// Check if listener already exists or is being set up
		if (this.listeners.has(key) || this.pendingListeners.has(key)) {
			console.info(`Listener '${key}' already exists or is being set up, skipping`);

			return false;
		}

		try {
			// Mark as pending to prevent duplicate setup attempts
			this.pendingListeners.add(key);

			// Setup the listener
			const unsubscribe = await setupFn();

			// Store the unsubscribe function
			this.listeners.set(key, unsubscribe);

			// Remove from pending
			this.pendingListeners.delete(key);

			console.info(`Listener '${key}' added successfully`);

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
		const unsubscribe = this.listeners.get(key);
		if (unsubscribe) {
			try {
				unsubscribe();
				this.listeners.delete(key);
				console.info(`Listener '${key}' removed successfully`);

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
		if (removed > 0) {
			console.info(`Cleaned up ${removed} listeners for statement ${statementId}`);
		}
	}

	/**
	 * Clean up listeners for a specific user
	 * @param userId The user ID to clean up listeners for
	 */
	public cleanupUserListeners(userId: string): void {
		const removed = this.removeMatchingListeners(`user-${userId}`);
		if (removed > 0) {
			console.info(`Cleaned up ${removed} listeners for user ${userId}`);
		}
	}
}

// Export singleton instance for convenience
export const listenerManager = ListenerManager.getInstance();