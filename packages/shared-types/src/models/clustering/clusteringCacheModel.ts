import * as v from 'valibot';

/**
 * One category in a question-specific taxonomy.
 * The taxonomy is derived per-parent-question by an LLM and persisted so reruns
 * are idempotent. `key` is a stable English snake_case id used in the
 * normalization step; `name` is the human-facing label in the dominant language.
 */
export const TaxonomyCategorySchema = v.object({
	key: v.string(),
	name: v.string(),
	description: v.string(),
});

export type TaxonomyCategory = v.InferOutput<typeof TaxonomyCategorySchema>;

/**
 * Cache record for the taxonomy of categories derived for a specific parent
 * question. Keyed by (parentId, questionHash, promptVersion) so that editing
 * the question text (or the prompt) invalidates the cache automatically.
 */
export const ClusteringTaxonomyCacheSchema = v.object({
	cacheId: v.string(), // sha256(parentId + questionHash + promptVersion)
	parentId: v.string(),
	questionHash: v.string(), // sha256 of normalized question text
	promptVersion: v.string(),
	language: v.string(), // ISO 639-1 code of dominant response language at derivation time
	categories: v.array(TaxonomyCategorySchema),
	createdAt: v.number(),
});

export type ClusteringTaxonomyCache = v.InferOutput<typeof ClusteringTaxonomyCacheSchema>;

/**
 * One canonical action extracted from a response.
 * `canonicalSentence` is the LLM-normalized form (preamble/framing stripped).
 * `categoryKey` references TaxonomyCategorySchema.key from the taxonomy used.
 * `canonicalEmbedding` is the L2-normalized OpenAI embedding of `canonicalSentence`,
 * stored on the cache record (NOT on the Statement) to avoid colliding with the
 * existing context-aware `Statement.embedding` field.
 */
export const NormalizationActionSchema = v.object({
	canonicalSentence: v.string(),
	categoryKey: v.string(),
	canonicalEmbedding: v.optional(v.array(v.number())),
});

export type NormalizationAction = v.InferOutput<typeof NormalizationActionSchema>;

/**
 * Cache record for an LLM-normalized response. Keyed by (statementId, lastUpdate,
 * promptVersion) so the cache invalidates automatically when the source statement
 * is edited or the prompt is bumped.
 */
export const ClusteringNormalizationCacheSchema = v.object({
	cacheId: v.string(), // statementId + ':' + lastUpdate + ':' + promptVersion
	statementId: v.string(),
	lastUpdate: v.number(), // matches Statement.lastUpdate at normalization time
	taxonomyCacheId: v.string(),
	promptVersion: v.string(),
	actions: v.array(NormalizationActionSchema),
	createdAt: v.number(),
});

export type ClusteringNormalizationCache = v.InferOutput<typeof ClusteringNormalizationCacheSchema>;
