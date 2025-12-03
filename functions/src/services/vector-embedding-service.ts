import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { logger } from "firebase-functions";
import "dotenv/config";

/**
 * Vector embedding service using Google's text-embedding model
 * Provides functionality to generate embeddings for semantic similarity search
 */

// Embedding model configuration
const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSION = 768;

interface EmbeddingResult {
  embedding: number[];
  dimension: number;
}

interface EmbeddingError {
  status?: number;
  statusText?: string;
  code?: string;
  message?: string;
}

/**
 * Get the GoogleGenerativeAI instance for embeddings
 */
function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  return new GoogleGenerativeAI(apiKey);
}

/**
 * Generate embedding for a single text using Gemini's embedding model
 * @param text - The text to generate embedding for
 * @param taskType - The type of task for the embedding (default: SEMANTIC_SIMILARITY)
 * @returns The embedding vector as an array of numbers
 */
export async function generateEmbedding(
  text: string,
  taskType: TaskType = TaskType.SEMANTIC_SIMILARITY
): Promise<EmbeddingResult> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const genAI = getGenAI();
      const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

      const result = await model.embedContent({
        content: { parts: [{ text }] },
        taskType,
      });

      const embedding = result.embedding.values;

      if (!embedding || embedding.length === 0) {
        throw new Error("Empty embedding returned from API");
      }

      logger.info("Generated embedding", {
        textLength: text.length,
        embeddingDimension: embedding.length,
      });

      return {
        embedding,
        dimension: embedding.length,
      };
    } catch (error: unknown) {
      const shouldRetry = await handleEmbeddingError(error, attempt, maxRetries, text);
      if (!shouldRetry) {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate embedding after all retries");
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts - Array of texts to generate embeddings for
 * @param taskType - The type of task for the embeddings
 * @returns Array of embedding results
 */
export async function generateBatchEmbeddings(
  texts: string[],
  taskType: TaskType = TaskType.SEMANTIC_SIMILARITY
): Promise<EmbeddingResult[]> {
  logger.info("Generating batch embeddings", { count: texts.length });

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 10;
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((text) => generateEmbedding(text, taskType))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Calculate cosine similarity between two vectors
 * @param vectorA - First embedding vector
 * @param vectorB - Second embedding vector
 * @returns Cosine similarity score (0-1, where 1 is most similar)
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error("Vectors must have the same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Handle embedding API errors with retry logic
 */
async function handleEmbeddingError(
  error: unknown,
  attempt: number,
  maxRetries: number,
  text: string
): Promise<boolean> {
  const errorMessage =
    error instanceof Error ? error.message : JSON.stringify(error);
  const apiError = error as EmbeddingError;
  const errorStatus = apiError?.status;
  const errorStatusText = apiError?.statusText;

  logger.warn(`Embedding request failed on attempt ${attempt}/${maxRetries}`, {
    error: errorMessage,
    status: errorStatus,
    statusText: errorStatusText,
  });

  const isRetryableError =
    errorStatus === 503 ||
    errorStatus === 429 ||
    errorStatus === 500 ||
    apiError?.code === "NETWORK_ERROR" ||
    errorMessage?.includes("fetch");

  if (!isRetryableError || attempt === maxRetries) {
    logger.error("Embedding request failed permanently", {
      error: errorMessage,
      textPreview: text.substring(0, 100) + "...",
      attempt,
      isRetryableError,
    });

    return false;
  }

  const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
  logger.info(`Waiting ${waitTime}ms before retry...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));

  return true;
}

/**
 * Get the embedding dimension for the current model
 */
export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

/**
 * Get the embedding model name
 */
export function getEmbeddingModel(): string {
  return EMBEDDING_MODEL;
}
