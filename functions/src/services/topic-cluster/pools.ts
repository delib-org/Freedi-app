import { logger } from 'firebase-functions';
import { embeddingService } from '../embedding-service';
import { POOL_REATTACH_THRESHOLD } from './constants';
import type { ClusterGroup, RawResponse } from './types';

interface PoolAttachment {
	statementId: string;
	groupId: string | null; // null = leave unassigned
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function l2(v: number[]): number[] {
	let n = 0;
	for (const x of v) n += x * x;
	n = Math.sqrt(n);
	if (n === 0) return v;

	return v.map((x) => x / n);
}

/**
 * Attach short-pool and noise-pool responses to the nearest cluster centroid
 * across ALL groups (across categories), if cosine > POOL_REATTACH_THRESHOLD.
 *
 * We embed the pool responses' raw text (NOT canonical, since these were never
 * normalized — they were filtered out before the LLM step). The threshold is
 * looser than NEAREST_CENTROID_THRESHOLD because raw text has more noise.
 */
export async function reattachPools(
	pool: RawResponse[],
	groups: ClusterGroup[],
): Promise<PoolAttachment[]> {
	if (pool.length === 0) return [];
	const candidateGroups = groups.filter((g) => g.centroid && g.centroid.length > 0);
	if (candidateGroups.length === 0) {
		return pool.map((r) => ({ statementId: r.statementId, groupId: null }));
	}

	const texts = pool.map((r) => r.text);
	const results = await embeddingService.generateBatchEmbeddings(texts, undefined, 100);
	const out: PoolAttachment[] = [];
	for (let i = 0; i < pool.length; i++) {
		const r = pool[i];
		const result = results[i];
		if (!result) {
			out.push({ statementId: r.statementId, groupId: null });
			continue;
		}
		const vec = l2(result.embedding);
		let bestSim = -Infinity;
		let bestGroup: ClusterGroup | null = null;
		for (const g of candidateGroups) {
			if (!g.centroid) continue;
			const sim = cosine(vec, g.centroid);
			if (sim > bestSim) {
				bestSim = sim;
				bestGroup = g;
			}
		}
		if (bestGroup && bestSim >= POOL_REATTACH_THRESHOLD) {
			out.push({ statementId: r.statementId, groupId: bestGroup.groupId });
		} else {
			out.push({ statementId: r.statementId, groupId: null });
		}
	}
	logger.info(
		`Pool reattach: ${out.filter((a) => a.groupId).length}/${pool.length} attached above threshold`,
	);

	return out;
}
