import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * Which embedding model does THIS question use?
 *
 * Why per-question: `text-embedding-3-small` is measurably poor at Hebrew
 * (true-paraphrase nearest-neighbour 56/100 vs 100/100 English;
 * `text-embedding-3-large` @1536 lifts Hebrew to 88/100 — see
 * embedding-service.ts). The decided rollout (2026-08-20) is per-question
 * migration: a named question moves to the better model while every other
 * question stays put. No flag day, no global backfill.
 *
 * Vectors from different models occupy different spaces — a cosine between
 * them is a number with no meaning — so the model choice must be consistent
 * across everything under one question: generation, the cache's compatibility
 * check, and vector-search's neighbour filter all resolve through here.
 *
 * Storage: `statementSettings.synthesis.embeddingModel` on the question doc —
 * the same per-question settings block the pipeline already reads, which the
 * benchmark harness's `--set` flag and the admin save path already know how
 * to write. Absent field (the normal case) → the global default.
 *
 * Fail-open and cached: an unreadable question doc resolves to the default
 * (identical to today's behaviour), and resolutions are cached per instance
 * for a few minutes so threading this through hot paths costs one question
 * read per parent per TTL. The cache means a just-migrated question can be
 * seen through a stale lens by OTHER warm instances for up to the TTL —
 * during that window their guard drops the new vectors, which degrades
 * matching briefly but corrupts nothing (the same degrade-not-corrupt
 * contract as the model guard itself).
 */

export const DEFAULT_EMBEDDING_MODEL =
	process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

/**
 * Models a question may pin. Both accept `dimensions: 1536`, which the
 * Firestore vector indexes require (firestore.indexes.json declares 1536).
 */
export const ALLOWED_EMBEDDING_MODELS = [
	'text-embedding-3-small',
	'text-embedding-3-large',
] as const;

export function isAllowedEmbeddingModel(value: unknown): value is string {
	return (
		typeof value === 'string' && (ALLOWED_EMBEDDING_MODELS as readonly string[]).includes(value)
	);
}

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
	model: string;
	at: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * The embedding model in force for a question's children. No parentId (or any
 * failure) → the global default.
 */
export async function resolveEmbeddingModel(parentId?: string | null): Promise<string> {
	if (!parentId) return DEFAULT_EMBEDDING_MODEL;

	const hit = cache.get(parentId);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.model;

	let model = DEFAULT_EMBEDDING_MODEL;
	try {
		const doc = await getFirestore().collection('statements').doc(parentId).get();
		const settings = doc.data()?.statementSettings as
			| { synthesis?: { embeddingModel?: unknown } }
			| undefined;
		const pinned = settings?.synthesis?.embeddingModel;
		if (isAllowedEmbeddingModel(pinned)) model = pinned;
		else if (pinned !== undefined) {
			logger.warn('embeddingModelResolver: ignoring unknown pinned model', {
				parentId,
				pinned,
			});
		}
	} catch (error) {
		logger.warn('embeddingModelResolver: question read failed, using default', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	cache.set(parentId, { model, at: Date.now() });

	return model;
}

/** Drop cached resolutions — after a migration writes the pinned model. */
export function invalidateEmbeddingModelCache(parentId?: string): void {
	if (parentId) cache.delete(parentId);
	else cache.clear();
}
