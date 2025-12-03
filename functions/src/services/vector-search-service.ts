import { logger } from "firebase-functions";
import { Collections, Statement } from "delib-npm";
import { db } from "../db";
import { generateEmbedding } from "./vector-embedding-service";

/**
 * Vector Search Service
 *
 * Provides vector similarity search functionality for finding similar statements
 * using Firestore's native vector search capabilities.
 */

interface VectorSearchResult {
  statementId: string;
  statement: string;
  description?: string;
  similarity: number;
  statementData: Statement;
}

interface VectorSearchOptions {
  parentId: string;
  limit?: number;
  minSimilarity?: number;
}

/**
 * Find similar statements using vector search
 *
 * @param userInput - The text to find similar statements for
 * @param options - Search options including parentId and limits
 * @returns Array of similar statements with their full data
 */
export async function findSimilarByVector(
  userInput: string,
  options: VectorSearchOptions
): Promise<VectorSearchResult[]> {
  const { parentId, limit = 5, minSimilarity = 0.6 } = options;
  const startTime = Date.now();

  try {
    if (!userInput || userInput.trim() === "") {
      logger.warn("Empty user input for vector search");

      return [];
    }

    // Generate embedding for the user's input
    const { embedding: queryEmbedding } = await generateEmbedding(userInput);

    // Build query with parentId filter
    const baseQuery = db
      .collection(Collections.statements)
      .where("parentId", "==", parentId);

    // Perform vector similarity search
    const vectorQuery = baseQuery.findNearest({
      vectorField: "embedding",
      queryVector: queryEmbedding,
      limit: limit,
      distanceMeasure: "COSINE",
    });

    const snapshot = await vectorQuery.get();

    // Process results
    const results: VectorSearchResult[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as Statement;
      // Firestore returns distance, convert to similarity (1 - distance for cosine)
      const distance = doc.get("vector_distance") ?? 0;
      const similarity = 1 - distance;

      // Filter by minimum similarity threshold
      if (similarity >= minSimilarity) {
        results.push({
          statementId: doc.id,
          statement: data.statement,
          description: data.description,
          similarity,
          statementData: data,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info("Vector search completed", {
      parentId,
      resultsCount: results.length,
      duration,
      userInputLength: userInput.length,
    });

    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error("Error in findSimilarByVector", {
      error,
      parentId,
      duration,
    });

    // Return empty array on error - let the fallback mechanism handle it
    return [];
  }
}

/**
 * Check if vector search is available for a given parent statement
 * by checking if any sub-statements have embeddings
 *
 * @param parentId - The parent statement ID
 * @returns True if vector search can be used
 */
export async function isVectorSearchAvailable(parentId: string): Promise<boolean> {
  try {
    const snapshot = await db
      .collection(Collections.statements)
      .where("parentId", "==", parentId)
      .where("embedding", "!=", null)
      .limit(1)
      .get();

    return !snapshot.empty;
  } catch (error) {
    logger.warn("Error checking vector search availability", { parentId, error });

    return false;
  }
}

/**
 * Get the count of statements with embeddings for a parent
 *
 * @param parentId - The parent statement ID
 * @returns Object with total count and embedded count
 */
export async function getEmbeddingCoverage(parentId: string): Promise<{
  totalStatements: number;
  statementsWithEmbeddings: number;
  coveragePercent: number;
}> {
  try {
    const [totalSnapshot, embeddedSnapshot] = await Promise.all([
      db
        .collection(Collections.statements)
        .where("parentId", "==", parentId)
        .count()
        .get(),
      db
        .collection(Collections.statements)
        .where("parentId", "==", parentId)
        .where("embeddedAt", ">", 0)
        .count()
        .get(),
    ]);

    const totalStatements = totalSnapshot.data().count;
    const statementsWithEmbeddings = embeddedSnapshot.data().count;
    const coveragePercent =
      totalStatements > 0
        ? Math.round((statementsWithEmbeddings / totalStatements) * 100)
        : 0;

    return {
      totalStatements,
      statementsWithEmbeddings,
      coveragePercent,
    };
  } catch (error) {
    logger.error("Error getting embedding coverage", { parentId, error });

    return {
      totalStatements: 0,
      statementsWithEmbeddings: 0,
      coveragePercent: 0,
    };
  }
}
