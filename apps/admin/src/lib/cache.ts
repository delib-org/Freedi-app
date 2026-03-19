import { Statement } from '@freedi/shared-types';

interface CacheEntry {
	data: Statement;
	expires: number;
}

const TTL = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

export function getCached(statementId: string): Statement | null {
	const entry = cache.get(statementId);

	if (!entry) return null;

	if (Date.now() > entry.expires) {
		cache.delete(statementId);
		return null;
	}

	return entry.data;
}

export function setCache(statementId: string, data: Statement): void {
	if (cache.size >= MAX_ENTRIES) {
		const firstKey = cache.keys().next().value;
		if (firstKey) cache.delete(firstKey);
	}

	cache.set(statementId, {
		data,
		expires: Date.now() + TTL,
	});
}

export function clearCache(): void {
	cache.clear();
}
