import { MindMapData, MindMapCacheEntry } from './types';
import { MINDMAP_CONFIG } from '@/constants/mindMap';

export interface CacheStats {
	entries: number;
	totalSizeBytes: number;
	oldestEntryAge: number;
	newestEntryAge: number;
	hitRate: number;
}

/**
 * Cache manager for mind-map data
 */
export class MindMapCache {
	private cache: Map<string, MindMapCacheEntry> = new Map();
	private cacheHits = 0;
	private cacheMisses = 0;

	/**
	 * Get data from cache
	 */
	public getFromCache(statementId: string): MindMapData | null {
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
	public addToCache(statementId: string, data: MindMapData): void {
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
	 * Check if statement is cached
	 */
	public has(statementId: string): boolean {
		return this.cache.has(statementId);
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
	 * Clear all cache data and reset statistics
	 */
	public clear(): void {
		this.cache.clear();
		this.cacheHits = 0;
		this.cacheMisses = 0;
	}

	/**
	 * Calculate cache hit rate
	 */
	private calculateCacheHitRate(): number {
		const total = this.cacheHits + this.cacheMisses;

		return total > 0 ? (this.cacheHits / total) * 100 : 0;
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
}
