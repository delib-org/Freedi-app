/**
 * A small promise cache for read-only callables: one entry per request key,
 * a TTL, and in-flight de-duplication so two screens asking for the same
 * view at once share one round trip. Pure — no React, no Firebase — so the
 * hook on top of it stays thin and this part is unit-tested.
 */

export interface RequestCacheOptions {
	/** How long a settled value is served without refetching. */
	ttlMs: number;
	/** Entries beyond this are evicted oldest-first (default 100). */
	maxEntries?: number;
	/** Clock, injectable for tests. */
	now?: () => number;
}

export interface RequestCache<T> {
	/**
	 * The cached value when fresh, else the result of `fetcher()` — which is
	 * shared with every concurrent caller of the same key. `bypass` ignores a
	 * fresh entry (and any in-flight fetch) and fetches again.
	 */
	get(key: string, fetcher: () => Promise<T>, options?: { bypass?: boolean }): Promise<T>;
	/** A fresh cached value, or `undefined` (never triggers a fetch). */
	peek(key: string): T | undefined;
	/** Drop one key, or everything. */
	invalidate(key?: string): void;
	/** Number of settled entries (for tests and diagnostics). */
	size(): number;
}

const DEFAULT_MAX_ENTRIES = 100;

export function createRequestCache<T>(options: RequestCacheOptions): RequestCache<T> {
	const { ttlMs, maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = options;
	const settled = new Map<string, { at: number; value: T }>();
	const inFlight = new Map<string, Promise<T>>();

	function fresh(key: string): T | undefined {
		const hit = settled.get(key);
		if (!hit) return undefined;
		if (now() - hit.at >= ttlMs) {
			settled.delete(key);

			return undefined;
		}

		return hit.value;
	}

	function trim(): void {
		while (settled.size > maxEntries) {
			const oldest = settled.keys().next().value;
			if (oldest === undefined) break;
			settled.delete(oldest);
		}
	}

	function start(key: string, fetcher: () => Promise<T>): Promise<T> {
		const promise = fetcher().then(
			(value) => {
				// A bypass that started later owns the key now; do not clobber it.
				if (inFlight.get(key) === promise) {
					inFlight.delete(key);
					settled.delete(key);
					settled.set(key, { at: now(), value });
					trim();
				}

				return value;
			},
			(error: unknown) => {
				if (inFlight.get(key) === promise) inFlight.delete(key);
				throw error;
			},
		);
		inFlight.set(key, promise);

		return promise;
	}

	return {
		get(key, fetcher, { bypass = false } = {}) {
			if (!bypass) {
				const value = fresh(key);
				if (value !== undefined) return Promise.resolve(value);
				const pending = inFlight.get(key);
				if (pending) return pending;
			} else {
				settled.delete(key);
			}

			return start(key, fetcher);
		},
		peek: (key) => fresh(key),
		invalidate(key) {
			if (key === undefined) {
				settled.clear();
				inFlight.clear();
			} else {
				settled.delete(key);
				inFlight.delete(key);
			}
		},
		size: () => settled.size,
	};
}
