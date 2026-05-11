import { logger } from 'firebase-functions';
import { embeddingService } from '../embedding-service';
import { getNormalizationCacheBatch, normalizationCacheId, saveNormalizationCache } from './cache';
import { PROMPT_VERSION_NORMALIZE } from './constants';
import type { ClusteringNormalizationCache } from '@freedi/shared-types';
import type { NormalizedResponse } from './types';

/**
 * L2-normalize a vector in-place and return it. UMAP+DBSCAN with cosine distance
 * works best on normalized vectors.
 */
function l2Normalize(v: number[]): number[] {
	let sum = 0;
	for (const x of v) sum += x * x;
	const norm = Math.sqrt(sum);
	if (norm === 0) return v;

	return v.map((x) => x / norm);
}

/**
 * Embed every canonical sentence across all responses. Caches embeddings on the
 * normalization cache record so reruns are free. Embeds with NO context — the
 * canonical sentence is self-describing by construction.
 */
export async function embedCanonicalSentences(
	responses: NormalizedResponse[],
	rawLastUpdates: Map<string, number>,
): Promise<NormalizedResponse[]> {
	// Reload cache records to upsert embeddings on top of normalization actions.
	const keys: Array<{ statementId: string; lastUpdate: number }> = [];
	for (const r of responses) {
		const lu = rawLastUpdates.get(r.statementId);
		if (lu !== undefined) keys.push({ statementId: r.statementId, lastUpdate: lu });
	}
	const cacheMap = await getNormalizationCacheBatch(keys);

	// Collect every canonical sentence missing an embedding.
	const toEmbed: Array<{ ri: number; ai: number; text: string }> = [];
	for (let ri = 0; ri < responses.length; ri++) {
		const resp = responses[ri];
		for (let ai = 0; ai < resp.actions.length; ai++) {
			const action = resp.actions[ai];
			if (!action.canonicalEmbedding) {
				// Try to read from cache first.
				const cached = cacheMap.get(resp.statementId);
				const cachedAction = cached?.actions[ai];
				if (cachedAction?.canonicalEmbedding && cachedAction.canonicalEmbedding.length > 0) {
					action.canonicalEmbedding = cachedAction.canonicalEmbedding;
					continue;
				}
				toEmbed.push({ ri, ai, text: action.canonicalSentence });
			}
		}
	}

	if (toEmbed.length === 0) {
		logger.info('Embeddings: 100% cache hit');

		return responses;
	}

	logger.info(`Embeddings: ${toEmbed.length} canonical sentences to embed`);

	const texts = toEmbed.map((t) => t.text);
	// embeddingService.generateBatchEmbeddings(texts, context, batchSize)
	// We pass NO context — canonical sentences should stand alone.
	const results = await embeddingService.generateBatchEmbeddings(texts, undefined, 100);

	if (results.length !== toEmbed.length) {
		logger.warn(
			`Embedding batch returned ${results.length} of ${toEmbed.length} expected — some failed`,
		);
	}

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const target = toEmbed[i];
		if (!r || !target) continue;
		responses[target.ri].actions[target.ai].canonicalEmbedding = l2Normalize(r.embedding);
	}

	// Persist updated embeddings back into cache records.
	for (const resp of responses) {
		const lu = rawLastUpdates.get(resp.statementId);
		if (lu === undefined) continue;
		const existing = cacheMap.get(resp.statementId);
		if (!existing) continue;
		// Merge embeddings into the cached actions array (matched by index).
		const merged = existing.actions.map((a, i) => ({
			...a,
			canonicalEmbedding: resp.actions[i]?.canonicalEmbedding ?? a.canonicalEmbedding,
		}));
		const updated: ClusteringNormalizationCache = {
			...existing,
			actions: merged,
			cacheId: normalizationCacheId(resp.statementId, lu),
			promptVersion: PROMPT_VERSION_NORMALIZE,
		};
		await saveNormalizationCache(updated);
	}

	return responses;
}
