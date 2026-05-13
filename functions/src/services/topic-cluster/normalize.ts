import * as v from 'valibot';
import { parse } from 'valibot';
import { logger } from 'firebase-functions';
import pLimit from 'p-limit';
import type {
	ClusteringNormalizationCache,
	ClusteringTaxonomyCache,
	NormalizationAction,
	Statement,
} from '@freedi/shared-types';
import { callLLM, extractJson, WORKER_MODEL } from '../../config/openai-chat';
import { NORMALIZE_BATCH_SIZE, NORMALIZE_CONCURRENCY, PROMPT_VERSION_NORMALIZE } from './constants';
import { getNormalizationCacheBatch, normalizationCacheId, saveNormalizationCache } from './cache';
import { NORMALIZE_SYSTEM, normalizeUserPrompt } from './prompts';
import type { NormalizedResponse, RawResponse } from './types';

const ActionSchema = v.object({
	canonical_sentence: v.string(),
	category_key: v.string(),
});

const NormalizeResponseEntrySchema = v.object({
	id: v.string(),
	actions: v.array(ActionSchema),
});

const NormalizeBatchResponseSchema = v.object({
	responses: v.array(NormalizeResponseEntrySchema),
});

interface NormalizeOptions {
	rebuildCache?: boolean;
}

/**
 * Normalize a list of responses to canonical actions + categories. Returns one
 * NormalizedResponse per input response, in the same order.
 *
 * Strategy:
 * 1. Read normalization cache in one batch by (statementId, lastUpdate).
 * 2. For uncached responses, call Haiku in batches of NORMALIZE_BATCH_SIZE
 *    with concurrency NORMALIZE_CONCURRENCY.
 * 3. On per-batch JSON parse failure, retry that batch as size-1 calls.
 * 4. Persist new cache records.
 */
export async function normalizeResponses(
	parent: Statement,
	taxonomy: ClusteringTaxonomyCache,
	responses: RawResponse[],
	opts: NormalizeOptions = {},
): Promise<NormalizedResponse[]> {
	if (responses.length === 0) return [];

	// 1. Cache lookup
	const cacheMap = opts.rebuildCache
		? new Map<string, ClusteringNormalizationCache>()
		: await getNormalizationCacheBatch(
				responses.map((r) => ({ statementId: r.statementId, lastUpdate: r.lastUpdate })),
			);

	const validCacheKeys = new Set(
		Array.from(cacheMap.values())
			.filter(
				(c) =>
					c.taxonomyCacheId === taxonomy.cacheId && c.promptVersion === PROMPT_VERSION_NORMALIZE,
			)
			.map((c) => c.statementId),
	);

	const uncached = responses.filter((r) => !validCacheKeys.has(r.statementId));
	logger.info(
		`Normalization: ${responses.length - uncached.length} cache hits, ${uncached.length} to call`,
	);

	// 2 + 3. Batch + concurrency-limited LLM calls.
	const limiter = pLimit(NORMALIZE_CONCURRENCY);
	const batches: RawResponse[][] = [];
	for (let i = 0; i < uncached.length; i += NORMALIZE_BATCH_SIZE) {
		batches.push(uncached.slice(i, i + NORMALIZE_BATCH_SIZE));
	}
	const newCache = new Map<string, ClusteringNormalizationCache>();
	const question = parent.statement ?? '';
	const tasks = batches.map((batch) =>
		limiter(async () => {
			const items = batch.map((r) => ({ id: r.statementId, text: r.text }));
			let parsedActions: Array<{ id: string; actions: NormalizationAction[] }> | null = null;
			try {
				parsedActions = await callBatch(question, taxonomy.categories, items);
			} catch (error) {
				logger.warn('Batch normalization failed; retrying as size-1', {
					batchSize: batch.length,
					error: (error as Error).message,
				});
				parsedActions = [];
				for (const item of items) {
					try {
						const single = await callBatch(question, taxonomy.categories, [item]);
						parsedActions.push(...single);
					} catch (innerError) {
						logger.error('Single-item normalization failed', {
							statementId: item.id,
							error: (innerError as Error).message,
						});
					}
				}
			}

			// Persist cache records for everything we got back.
			for (const r of batch) {
				const got = parsedActions.find((p) => p.id === r.statementId);
				if (!got) continue;
				const record: ClusteringNormalizationCache = {
					cacheId: normalizationCacheId(r.statementId, r.lastUpdate),
					statementId: r.statementId,
					lastUpdate: r.lastUpdate,
					taxonomyCacheId: taxonomy.cacheId,
					promptVersion: PROMPT_VERSION_NORMALIZE,
					actions: got.actions,
					createdAt: Date.now(),
				};
				await saveNormalizationCache(record);
				newCache.set(r.statementId, record);
			}
		}),
	);
	await Promise.all(tasks);

	// 4. Build output in original order, filling from cache (old + new).
	const out: NormalizedResponse[] = [];
	const validKeys = new Set([...taxonomy.categories.map((c) => c.key), 'other']);
	for (const r of responses) {
		const cached = newCache.get(r.statementId) ?? cacheMap.get(r.statementId);
		if (!cached) {
			// Failed to normalize; fall back to a single-action with category 'other'
			// using the raw text (degraded but keeps the response in the pipeline).
			out.push({
				statementId: r.statementId,
				actions: [{ canonicalSentence: r.text, categoryKey: 'other' }],
			});
			continue;
		}
		const actions = cached.actions
			.map((a) => ({
				canonicalSentence: a.canonicalSentence,
				categoryKey: validKeys.has(a.categoryKey) ? a.categoryKey : 'other',
			}))
			.filter((a) => a.canonicalSentence.trim().length > 0);
		out.push({
			statementId: r.statementId,
			actions: actions.length > 0 ? actions : [{ canonicalSentence: r.text, categoryKey: 'other' }],
		});
	}

	return out;
}

async function callBatch(
	question: string,
	categories: ClusteringTaxonomyCache['categories'],
	items: Array<{ id: string; text: string }>,
): Promise<Array<{ id: string; actions: NormalizationAction[] }>> {
	const prompt = normalizeUserPrompt(question, categories, items);
	const raw = await callLLM({
		model: WORKER_MODEL,
		system: NORMALIZE_SYSTEM,
		user: prompt,
		maxTokens: 2048,
		temperature: 0,
		jsonMode: true,
	});
	const json = extractJson(raw);
	const parsed = parse(NormalizeBatchResponseSchema, JSON.parse(json));

	return parsed.responses.map((r) => ({
		id: r.id,
		actions: r.actions.map((a) => ({
			canonicalSentence: a.canonical_sentence.trim(),
			categoryKey: a.category_key.trim(),
		})),
	}));
}
