import * as v from "valibot";

/**
 * Constants for embedding configuration
 */
export const EMBEDDING_CONFIG = {
  MODEL: "text-embedding-3-small",
  DIMENSIONS: 1536,
  DEFAULT_SIMILARITY_THRESHOLD: 0.80,
  MAX_BATCH_SIZE: 100,
  CACHE_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days - embeddings rarely change
} as const;

/**
 * Status of an embedding operation
 */
export const EmbeddingStatus = {
  pending: "pending",
  processing: "processing",
  completed: "completed",
  failed: "failed",
} as const;

export type EmbeddingStatus =
  (typeof EmbeddingStatus)[keyof typeof EmbeddingStatus];

export const EmbeddingStatusSchema = v.picklist([
  EmbeddingStatus.pending,
  EmbeddingStatus.processing,
  EmbeddingStatus.completed,
  EmbeddingStatus.failed,
]);

/**
 * Method used for similarity search
 */
export const SimilaritySearchMethod = {
  embedding: "embedding",
  llm: "llm",
  hybrid: "hybrid",
  fallback: "fallback",
} as const;

export type SimilaritySearchMethod =
  (typeof SimilaritySearchMethod)[keyof typeof SimilaritySearchMethod];

export const SimilaritySearchMethodSchema = v.picklist([
  SimilaritySearchMethod.embedding,
  SimilaritySearchMethod.llm,
  SimilaritySearchMethod.hybrid,
  SimilaritySearchMethod.fallback,
]);

/**
 * StatementEmbedding - stored embedding for a statement
 */
export const StatementEmbeddingSchema = v.object({
  embedding: v.array(v.number()), // 1536-dimensional vector
  embeddingModel: v.string(), // Model used (e.g., "text-embedding-3-small")
  embeddingContext: v.optional(v.string()), // Parent question used for context
  embeddingCreatedAt: v.number(), // Timestamp in milliseconds
});

export type StatementEmbedding = v.InferOutput<typeof StatementEmbeddingSchema>;

/**
 * StatementEmbeddingDoc - `statementEmbeddings/{statementId}`.
 *
 * Vectors used to live as fields on the statement doc, and every client
 * listening to a statement downloaded ~57 KB of vector on every change to it.
 * They now live in this server-only collection, one doc per statement, keyed
 * by the statement id. `parentId` mirrors the statement's so vector search can
 * pre-filter by question (`findNearest` needs the filter on the same doc); the
 * statement update trigger keeps it in sync when a statement moves.
 *
 * Vectors are Firestore VectorValues on the server; the schema describes the
 * plain-array form the Admin SDK hands back after `toArray()`.
 */
export const StatementEmbeddingDocSchema = v.object({
  statementId: v.string(),
  parentId: v.string(),
  embedding: v.optional(v.array(v.number())),
  embeddingModel: v.optional(v.string()),
  embeddingContext: v.optional(v.nullable(v.string())),
  embeddingCreatedAt: v.optional(v.number()),
  /** Short LLM gist of the statement the vector was built from. */
  embeddingBrief: v.optional(v.string()),
  /** sha1 of the statement text the vector was built from. */
  textHash: v.optional(v.string()),
  /** Text vector + 8 rating dims (hybrid clustering). */
  hybridEmbedding: v.optional(v.array(v.number())),
  hybridEmbeddingStale: v.optional(v.boolean()),
  hybridEmbeddingUpdatedAt: v.optional(v.number()),
  lastUpdate: v.number(),
});

export type StatementEmbeddingDoc = v.InferOutput<typeof StatementEmbeddingDocSchema>;

/**
 * SimilarityResult - result from similarity search
 */
export const SimilarityResultSchema = v.object({
  statementId: v.string(),
  similarity: v.number(), // 0-1 cosine similarity score
  statement: v.string(), // The statement text for display
});

export type SimilarityResult = v.InferOutput<typeof SimilarityResultSchema>;

/**
 * EmbeddingBatchRequest - request to generate embeddings for multiple statements
 */
export const EmbeddingBatchRequestSchema = v.object({
  parentStatementId: v.string(), // Question ID to get context
  statementIds: v.array(v.string()), // Statements to generate embeddings for
  forceRegenerate: v.optional(v.boolean()), // Regenerate even if exists
});

export type EmbeddingBatchRequest = v.InferOutput<
  typeof EmbeddingBatchRequestSchema
>;

/**
 * EmbeddingBatchResult - result of batch embedding generation
 */
export const EmbeddingBatchResultSchema = v.object({
  totalRequested: v.number(),
  successCount: v.number(),
  failedCount: v.number(),
  skippedCount: v.number(), // Already had embeddings
  failedStatementIds: v.array(v.string()),
  processingTimeMs: v.number(),
});

export type EmbeddingBatchResult = v.InferOutput<
  typeof EmbeddingBatchResultSchema
>;

/**
 * EmbeddingStatusReport - status of embeddings for a question
 */
export const EmbeddingStatusReportSchema = v.object({
  parentStatementId: v.string(),
  totalStatements: v.number(),
  withEmbeddings: v.number(),
  withoutEmbeddings: v.number(),
  coveragePercent: v.number(),
  lastUpdated: v.number(),
});

export type EmbeddingStatusReport = v.InferOutput<
  typeof EmbeddingStatusReportSchema
>;

/**
 * FindSimilarResponse - response from similarity search endpoint
 */
export const FindSimilarResponseSchema = v.object({
  ok: v.boolean(),
  similarStatements: v.array(SimilarityResultSchema),
  userText: v.string(),
  method: SimilaritySearchMethodSchema,
  responseTimeMs: v.number(),
  cached: v.boolean(),
  error: v.optional(v.string()),
});

export type FindSimilarResponse = v.InferOutput<
  typeof FindSimilarResponseSchema
>;

/**
 * Helper function to check if a statement has a valid embedding
 */
export function hasValidEmbedding(
  statement: Partial<StatementEmbedding>
): boolean {
  return Boolean(
    statement.embedding &&
      Array.isArray(statement.embedding) &&
      statement.embedding.length === EMBEDDING_CONFIG.DIMENSIONS
  );
}

/**
 * Helper function to validate embedding dimensions
 */
export function validateEmbeddingDimensions(
  embedding: number[]
): boolean {
  return embedding.length === EMBEDDING_CONFIG.DIMENSIONS;
}
