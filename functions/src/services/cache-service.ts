import { logger } from 'firebase-functions';
import { getFirestore, CollectionReference, DocumentData } from 'firebase-admin/firestore';

interface CacheEntry {
	value: unknown;
	expiresAt: number;
	createdAt: number;
	hitCount: number;
	lastAccessed?: number;
}

/**
 * Firestore-based cache service for optimizing expensive operations
 * Provides a simple key-value cache with TTL support
 */
class FirestoreCacheService {
	private _collection: CollectionReference<DocumentData> | null = null;

	/**
	 * Lazily initialize the Firestore collection to avoid initialization errors during testing
	 */
	private get collection(): CollectionReference<DocumentData> {
		if (!this._collection) {
			this._collection = getFirestore().collection('_cache');
		}

		return this._collection;
	}

	/**
	 * Retrieves a cached value by key
	 * @param key - The cache key to look up
	 * @returns The cached value or null if not found/expired
	 */
	async get<T>(key: string): Promise<T | null> {
		try {
			const doc = await this.collection.doc(key).get();

			if (!doc.exists) {
				return null;
			}

			const data = doc.data() as CacheEntry;

			// Check expiration
			if (data.expiresAt < Date.now()) {
				// Async cleanup, don't wait
				this.collection
					.doc(key)
					.delete()
					.catch((error) => {
						logger.warn(`Failed to delete expired cache entry ${key}:`, error);
					});

				return null;
			}

			// Update hit count and last accessed time asynchronously
			this.collection
				.doc(key)
				.update({
					hitCount: (data.hitCount || 0) + 1,
					lastAccessed: Date.now(),
				})
				.catch((error) => {
					logger.warn(`Failed to update cache hit count for ${key}:`, error);
				});

			return data.value as T;
		} catch (error) {
			logger.error('Cache get error:', error);

			return null; // Fail gracefully
		}
	}

	/**
	 * Stores a value in the cache with a TTL
	 * @param key - The cache key
	 * @param value - The value to cache
	 * @param ttlMinutes - Time to live in minutes (default: 5)
	 */
	async set(key: string, value: unknown, ttlMinutes: number = 5): Promise<void> {
		try {
			await this.collection.doc(key).set({
				value,
				expiresAt: Date.now() + ttlMinutes * 60 * 1000,
				createdAt: Date.now(),
				hitCount: 0,
			});
		} catch (error) {
			logger.error('Cache set error:', error);
			// Fail silently - caching is not critical
		}
	}

	/**
	 * Deletes a cached value by key
	 * @param key - The cache key to delete
	 */
	async delete(key: string): Promise<void> {
		try {
			await this.collection.doc(key).delete();
		} catch (error) {
			logger.warn(`Failed to delete cache entry ${key}:`, error);
		}
	}

	/**
	 * Clears all cache entries (use with caution)
	 */
	async clearAll(): Promise<void> {
		try {
			const snapshot = await this.collection.get();
			const batch = getFirestore().batch();

			snapshot.docs.forEach((doc) => {
				batch.delete(doc.ref);
			});

			await batch.commit();
			logger.info(`Cleared ${snapshot.size} cache entries`);
		} catch (error) {
			logger.error('Failed to clear cache:', error);
		}
	}

	/**
	 * Cleans up expired cache entries
	 * Should be called periodically via a scheduled function
	 */
	async cleanupExpired(): Promise<void> {
		try {
			const now = Date.now();
			const snapshot = await this.collection.where('expiresAt', '<', now).get();

			if (snapshot.empty) {
				return;
			}

			const batch = getFirestore().batch();
			snapshot.docs.forEach((doc) => {
				batch.delete(doc.ref);
			});

			await batch.commit();
			logger.info(`Cleaned up ${snapshot.size} expired cache entries`);
		} catch (error) {
			logger.error('Failed to cleanup expired cache entries:', error);
		}
	}

	/**
	 * Generates a deterministic cache key from multiple parts
	 * @param parts - Parts to combine into a cache key
	 * @returns A short, deterministic cache key
	 */
	generateKey(...parts: string[]): string {
		// Create a deterministic hash from the parts
		const combined = parts.join('_');
		// Use a simple hash function for deterministic key generation
		let hash = 0;
		for (let i = 0; i < combined.length; i++) {
			const char = combined.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}

		// Convert to base36 for shorter keys and add prefix
		return `cache_${Math.abs(hash).toString(36)}`;
	}

	/**
	 * Gets cache statistics (for monitoring)
	 */
	async getStats(): Promise<{
		totalEntries: number;
		expiredEntries: number;
		activeEntries: number;
	}> {
		try {
			const now = Date.now();
			const snapshot = await this.collection.get();
			let expired = 0;
			let active = 0;

			snapshot.docs.forEach((doc) => {
				const data = doc.data() as CacheEntry;
				if (data.expiresAt < now) {
					expired++;
				} else {
					active++;
				}
			});

			return {
				totalEntries: snapshot.size,
				expiredEntries: expired,
				activeEntries: active,
			};
		} catch (error) {
			logger.error('Failed to get cache stats:', error);

			return {
				totalEntries: 0,
				expiredEntries: 0,
				activeEntries: 0,
			};
		}
	}
}

// Export singleton instance
export const cache = new FirestoreCacheService();
