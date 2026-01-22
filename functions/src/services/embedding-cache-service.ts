import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL } from "./embedding-service";

// Helper to extract array from VectorValue or return as-is if already an array
function extractEmbeddingArray(embedding: unknown): number[] | null {
  if (!embedding) return null;

  // If it's already an array
  if (Array.isArray(embedding)) {
    return embedding as number[];
  }

  // If it's a VectorValue with toArray method
  if (typeof embedding === "object" && embedding !== null && "toArray" in embedding) {
    const vectorValue = embedding as { toArray: () => number[] };
    
return vectorValue.toArray();
  }

  return null;
}

interface EmbeddingWithStatement {
  statementId: string;
  embedding: number[];
  statement: string;
}

/**
 * Service for storing and retrieving statement embeddings from Firestore
 *
 * Embeddings are stored directly on the statement document to enable
 * Firestore's native vector search capabilities.
 */
class EmbeddingCacheService {
  private db = getFirestore();
  private statementsCollection = "statements";

  /**
   * Get embedding for a single statement
   * @param statementId - The statement ID
   * @returns The embedding array or null if not found
   */
  async getEmbedding(statementId: string): Promise<number[] | null> {
    try {
      const doc = await this.db
        .collection(this.statementsCollection)
        .doc(statementId)
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
      const embedding = extractEmbeddingArray(data?.embedding);
      
return embedding;
    } catch (error) {
      logger.error("Failed to get embedding from cache", {
        statementId,
        error,
      });
      
return null;
    }
  }

  /**
   * Get embeddings for multiple statements
   * @param statementIds - Array of statement IDs
   * @returns Map of statementId -> embedding for found embeddings
   */
  async getBatchEmbeddings(
    statementIds: string[]
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();

    if (statementIds.length === 0) {
      return result;
    }

    try {
      // Firestore 'in' query limit is 30, batch if needed
      const batchSize = 30;
      for (let i = 0; i < statementIds.length; i += batchSize) {
        const batch = statementIds.slice(i, i + batchSize);

        const snapshot = await this.db
          .collection(this.statementsCollection)
          .where("statementId", "in", batch)
          .get();

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const embedding = extractEmbeddingArray(data?.embedding);
          if (embedding) {
            result.set(doc.id, embedding);
          }
        });
      }

      logger.info(`Retrieved ${result.size}/${statementIds.length} embeddings`);
      
return result;
    } catch (error) {
      logger.error("Failed to get batch embeddings", { error });
      
return result;
    }
  }

  /**
   * Save embedding to a statement document
   * @param statementId - The statement ID
   * @param embedding - The 768-dimensional embedding vector
   * @param context - Optional context used for embedding (e.g., parent question)
   */
  async saveEmbedding(
    statementId: string,
    embedding: number[],
    context?: string
  ): Promise<void> {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      logger.warn(
        `Invalid embedding dimensions: ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`
      );
    }

    try {
      // Use FieldValue.vector() for Firestore vector search compatibility
      const vectorValue = FieldValue.vector(embedding);

      await this.db
        .collection(this.statementsCollection)
        .doc(statementId)
        .update({
          embedding: vectorValue,
          embeddingModel: OPENAI_EMBEDDING_MODEL,
          embeddingContext: context || null,
          embeddingCreatedAt: Date.now(),
        });

      logger.info(`Saved embedding for statement ${statementId}`);
    } catch (error) {
      logger.error("Failed to save embedding", { statementId, error });
      throw error;
    }
  }

  /**
   * Save embeddings for multiple statements in batch
   * @param embeddings - Array of {statementId, embedding, context}
   */
  async saveBatchEmbeddings(
    embeddings: Array<{
      statementId: string;
      embedding: number[];
      context?: string;
    }>
  ): Promise<{ success: number; failed: number }> {
    if (embeddings.length === 0) {
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    // Firestore batch limit is 500 operations
    const batchSize = 500;

    for (let i = 0; i < embeddings.length; i += batchSize) {
      const batch = this.db.batch();
      const currentBatch = embeddings.slice(i, i + batchSize);

      for (const item of currentBatch) {
        try {
          const vectorValue = FieldValue.vector(item.embedding);
          const docRef = this.db
            .collection(this.statementsCollection)
            .doc(item.statementId);

          batch.update(docRef, {
            embedding: vectorValue,
            embeddingModel: OPENAI_EMBEDDING_MODEL,
            embeddingContext: item.context || null,
            embeddingCreatedAt: Date.now(),
          });
          success++;
        } catch (error) {
          logger.warn(`Failed to add to batch: ${item.statementId}`, { error });
          failed++;
        }
      }

      try {
        await batch.commit();
      } catch (error) {
        logger.error("Batch commit failed", { error });
        // Count all items in this batch as failed
        failed += currentBatch.length - success;
        success = 0;
      }
    }

    logger.info(`Batch save complete: ${success} success, ${failed} failed`);
    
return { success, failed };
  }

  /**
   * Check if a statement has an embedding
   * @param statementId - The statement ID
   * @returns true if embedding exists
   */
  async hasEmbedding(statementId: string): Promise<boolean> {
    try {
      const doc = await this.db
        .collection(this.statementsCollection)
        .doc(statementId)
        .get();

      if (!doc.exists) {
        return false;
      }

      const data = doc.data();
      
return Boolean(data?.embedding);
    } catch (error) {
      logger.error("Failed to check embedding existence", {
        statementId,
        error,
      });
      
return false;
    }
  }

  /**
   * Get all statements with embeddings under a parent
   * @param parentId - The parent statement ID
   * @returns Array of {statementId, embedding, statement}
   */
  async getEmbeddingsForParent(
    parentId: string
  ): Promise<EmbeddingWithStatement[]> {
    try {
      // Query all statements (don't filter by hide - it may not exist on all docs)
      const snapshot = await this.db
        .collection(this.statementsCollection)
        .where("parentId", "==", parentId)
        .get();

      const results: EmbeddingWithStatement[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        // Skip hidden statements
        if (data?.hide === true) {
          return;
        }
        const embedding = extractEmbeddingArray(data?.embedding);
        if (embedding) {
          results.push({
            statementId: doc.id,
            embedding,
            statement: data.statement || "",
          });
        }
      });

      logger.info(
        `Found ${results.length} statements with embeddings under parent ${parentId}`
      );
      
return results;
    } catch (error) {
      logger.error("Failed to get embeddings for parent", { parentId, error });
      
return [];
    }
  }

  /**
   * Get embedding coverage statistics for a parent statement
   * @param parentId - The parent statement ID
   * @returns Statistics about embedding coverage
   */
  async getEmbeddingCoverage(parentId: string): Promise<{
    totalStatements: number;
    withEmbeddings: number;
    withoutEmbeddings: number;
    coveragePercent: number;
  }> {
    try {
      // Query all statements under parent (don't filter by hide - it may not exist)
      const snapshot = await this.db
        .collection(this.statementsCollection)
        .where("parentId", "==", parentId)
        .get();

      let withEmbeddings = 0;
      let withoutEmbeddings = 0;
      let totalStatements = 0;

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        // Skip hidden statements
        if (data?.hide === true) {
          return;
        }
        totalStatements++;
        if (data?.embedding) {
          withEmbeddings++;
        } else {
          withoutEmbeddings++;
        }
      });
      const coveragePercent =
        totalStatements > 0
          ? Math.round((withEmbeddings / totalStatements) * 100)
          : 0;

      return {
        totalStatements,
        withEmbeddings,
        withoutEmbeddings,
        coveragePercent,
      };
    } catch (error) {
      logger.error("Failed to get embedding coverage", { parentId, error });
      
return {
        totalStatements: 0,
        withEmbeddings: 0,
        withoutEmbeddings: 0,
        coveragePercent: 0,
      };
    }
  }

  /**
   * Delete embedding from a statement (for regeneration)
   * @param statementId - The statement ID
   */
  async deleteEmbedding(statementId: string): Promise<void> {
    try {
      await this.db
        .collection(this.statementsCollection)
        .doc(statementId)
        .update({
          embedding: FieldValue.delete(),
          embeddingModel: FieldValue.delete(),
          embeddingContext: FieldValue.delete(),
          embeddingCreatedAt: FieldValue.delete(),
        });

      logger.info(`Deleted embedding for statement ${statementId}`);
    } catch (error) {
      logger.error("Failed to delete embedding", { statementId, error });
      throw error;
    }
  }
}

// Export singleton instance
export const embeddingCache = new EmbeddingCacheService();

// Also export class for testing
export { EmbeddingCacheService };
