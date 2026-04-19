/**
 * Server-side check: is research logging enabled on the top parent
 * of a statement? Mirrors the client helper in researchLogger.ts but
 * reads directly from Firestore and memoizes for 60s to avoid hammering
 * the DB on hot evaluation traffic.
 */

import { Collections } from '@freedi/shared-types';
import { db } from '../../index';

interface CacheEntry {
	enabled: boolean;
	expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export async function isResearchEnabledForTopParent(
	topParentId: string | undefined,
): Promise<boolean> {
	if (!topParentId) return false;

	const cached = cache.get(topParentId);
	if (cached && Date.now() < cached.expiresAt) return cached.enabled;

	try {
		const snap = await db.collection(Collections.statements).doc(topParentId).get();
		const enabled =
			snap.exists && snap.data()?.statementSettings?.enableResearchLogging === true;

		cache.set(topParentId, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });

		return enabled;
	} catch {
		return cached?.enabled ?? false;
	}
}
