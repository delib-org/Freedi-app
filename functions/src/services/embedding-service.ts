import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../config/gemini";
import { notifyAIError } from "./error-notification-service";

interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

interface APIError {
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
 * Embedding Service for generating vector embeddings using Gemini
 *
 * Uses text-embedding-004 model which produces 768-dimensional vectors.
 * Supports context-aware embeddings for better semantic matching.
 */
class EmbeddingService {
  /**
   * Generate embedding for a single text
   * @param text - The text to embed
   * @param context - Optional context (e.g., parent question) for context-aware embedding
   * @returns EmbeddingResult with 768-dimensional vector
   */
  async generateEmbedding(
    text: string,
    context?: string
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();

    try {
      const genAI = getGenAI();
      const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

      // Combine text with context for context-aware embedding
      // This helps the embedding capture meaning relative to the question
      const input = context
        ? `Question: ${context}\nSuggestion: ${text}`
        : text;

      const result = await model.embedContent(input);
      const embedding = result.embedding.values;

      // Validate dimensions
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        logger.warn(
          `Embedding dimension mismatch: got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`
        );
      }

      const duration = Date.now() - startTime;
      logger.info("Embedding generated successfully", {
        textLength: text.length,
        hasContext: !!context,
        dimensions: embedding.length,
        durationMs: duration,
      });

      return {
        embedding,
        model: EMBEDDING_MODEL,
        dimensions: embedding.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);

      logger.error("Failed to generate embedding", {
        error: errorMessage,
        textLength: text.length,
        hasContext: !!context,
      });

      // Notify admin of embedding errors
      notifyAIError(errorMessage, {
        model: EMBEDDING_MODEL,
        prompt: text.substring(0, 100),
        functionName: "embedding-service.generateEmbedding",
      }).catch((notifyError) => {
        logger.warn("Failed to send embedding error notification", {
          notifyError,
        });
      });

      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Processes in parallel with rate limiting to avoid API throttling
   *
   * @param texts - Array of texts to embed
   * @param context - Optional shared context for all texts
   * @param batchSize - Number of parallel requests (default: 10)
   * @returns Array of EmbeddingResults in same order as input
   */
  async generateBatchEmbeddings(
    texts: string[],
    context?: string,
    batchSize: number = 10
  ): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const startTime = Date.now();
    const results: EmbeddingResult[] = [];

    logger.info(`Starting batch embedding generation for ${texts.length} texts`);

    // Process in batches with rate limiting
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map((text) =>
          this.generateEmbedding(text, context).catch((error) => {
            logger.error(
              `Failed to generate embedding for text at index ${i}:`,
              error
            );
            // Return null for failed embeddings, caller can handle
            return null;
          })
        )
      );

      // Filter out nulls and add to results
      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }

      // Rate limiting: wait 100ms between batches
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    logger.info("Batch embedding generation complete", {
      totalTexts: texts.length,
      successfulEmbeddings: results.length,
      failedEmbeddings: texts.length - results.length,
      durationMs: duration,
    });

    return results;
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   * @param a - First embedding vector
   * @param b - Second embedding vector
   * @returns Similarity score between -1 and 1 (1 = identical, 0 = orthogonal)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(
        `Vector dimension mismatch: ${a.length} vs ${b.length}`
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Find top K most similar embeddings from a list
   * @param queryEmbedding - The embedding to compare against
   * @param candidates - Array of candidate embeddings with IDs
   * @param topK - Number of top results to return
   * @param threshold - Minimum similarity threshold (default: 0.65)
   * @returns Array of {id, similarity} sorted by similarity descending
   */
  findTopKSimilar(
    queryEmbedding: number[],
    candidates: Array<{ id: string; embedding: number[] }>,
    topK: number,
    threshold: number = 0.65
  ): Array<{ id: string; similarity: number }> {
    const results: Array<{ id: string; similarity: number }> = [];

    for (const candidate of candidates) {
      const similarity = this.cosineSimilarity(
        queryEmbedding,
        candidate.embedding
      );

      if (similarity >= threshold) {
        results.push({
          id: candidate.id,
          similarity,
        });
      }
    }

    // Sort by similarity descending and take top K
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Retry wrapper for embedding generation with exponential backoff
   * @param text - Text to embed
   * @param context - Optional context
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns EmbeddingResult or throws after all retries exhausted
   */
  async generateEmbeddingWithRetry(
    text: string,
    context?: string,
    maxRetries: number = 3
  ): Promise<EmbeddingResult> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateEmbedding(text, context);
      } catch (error) {
        lastError = error;
        const apiError = error as APIError;
        const isRetryable =
          apiError?.status === 503 ||
          apiError?.status === 429 ||
          apiError?.status === 500;

        if (!isRetryable || attempt === maxRetries) {
          logger.error(
            `Embedding generation failed permanently after ${attempt} attempts`,
            { error }
          );
          break;
        }

        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.info(
          `Embedding attempt ${attempt} failed, retrying in ${waitTime}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw lastError;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();

// Also export class for testing
export { EmbeddingService };
