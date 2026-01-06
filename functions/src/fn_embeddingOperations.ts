import { Request, Response } from "firebase-functions/v1";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { Collections, Statement, StatementType } from "@freedi/shared-types";
import { embeddingService } from "./services/embedding-service";
import { embeddingCache } from "./services/embedding-cache-service";

const db = getFirestore();

interface BackfillProgress {
  totalStatements: number;
  processedStatements: number;
  successfulEmbeddings: number;
  failedStatements: number;
  skippedStatements: number;
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "failed";
  lastProcessedId?: string;
}

const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY_MS = 200;

/**
 * Generate embeddings for all option statements under a question
 * Admin-only endpoint for backfilling existing statements
 */
export async function generateBulkEmbeddings(
  request: Request,
  response: Response
): Promise<void> {
  const startTime = Date.now();

  try {
    const { parentStatementId, forceRegenerate = false, limit = 500 } = request.body;

    if (!parentStatementId) {
      response.status(400).send({
        ok: false,
        error: "parentStatementId is required",
      });
      
return;
    }

    logger.info("Starting bulk embedding generation", {
      parentStatementId,
      forceRegenerate,
      limit,
    });

    // Get parent statement for context
    const parentDoc = await db
      .collection(Collections.statements)
      .doc(parentStatementId)
      .get();

    if (!parentDoc.exists) {
      response.status(404).send({
        ok: false,
        error: "Parent statement not found",
      });
      
return;
    }

    const parentStatement = parentDoc.data() as Statement;
    const context = parentStatement.statement || "";

    // Get all option statements under this parent
    let query = db
      .collection(Collections.statements)
      .where("parentId", "==", parentStatementId)
      .where("statementType", "==", StatementType.option)
      .limit(limit);

    const snapshot = await query.get();

    if (snapshot.empty) {
      response.status(200).send({
        ok: true,
        result: {
          totalStatements: 0,
          processedStatements: 0,
          successfulEmbeddings: 0,
          failedStatements: 0,
          skippedStatements: 0,
          processingTimeMs: Date.now() - startTime,
        },
      });
      
return;
    }

    const progress: BackfillProgress = {
      totalStatements: snapshot.size,
      processedStatements: 0,
      successfulEmbeddings: 0,
      failedStatements: 0,
      skippedStatements: 0,
      startedAt: startTime,
      status: "running",
    };

    // Process in batches
    const statements = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Statement,
    }));

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);

      for (const { id, data } of batch) {
        progress.processedStatements++;
        progress.lastProcessedId = id;

        try {
          // Skip if already has embedding and not forcing regeneration
          if (!forceRegenerate) {
            const hasExisting = await embeddingCache.hasEmbedding(id);
            if (hasExisting) {
              progress.skippedStatements++;
              continue;
            }
          }

          // Skip if text is too short
          if (!data.statement || data.statement.trim().length < 3) {
            progress.skippedStatements++;
            continue;
          }

          // Generate embedding
          const result = await embeddingService.generateEmbeddingWithRetry(
            data.statement,
            context
          );

          // Save to statement document
          await embeddingCache.saveEmbedding(id, result.embedding, context);
          progress.successfulEmbeddings++;

        } catch (error) {
          progress.failedStatements++;
          logger.warn(`Failed to generate embedding for ${id}:`, error);
        }
      }

      // Rate limiting between batches
      if (i + BATCH_SIZE < statements.length) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }

      // Log progress
      logger.info("Backfill progress", {
        processed: progress.processedStatements,
        total: progress.totalStatements,
        successful: progress.successfulEmbeddings,
        failed: progress.failedStatements,
        skipped: progress.skippedStatements,
      });
    }

    progress.status = "completed";
    progress.completedAt = Date.now();

    const processingTime = Date.now() - startTime;
    logger.info("Bulk embedding generation complete", {
      ...progress,
      processingTimeMs: processingTime,
    });

    response.status(200).send({
      ok: true,
      result: {
        ...progress,
        processingTimeMs: processingTime,
      },
    });

  } catch (error) {
    logger.error("Error in generateBulkEmbeddings:", error);
    response.status(500).send({
      ok: false,
      error: "Failed to generate bulk embeddings",
    });
  }
}

/**
 * Get embedding coverage status for a question
 * Returns how many statements have embeddings vs total
 */
export async function getEmbeddingStatus(
  request: Request,
  response: Response
): Promise<void> {
  try {
    const { parentStatementId } = request.query;

    if (!parentStatementId || typeof parentStatementId !== "string") {
      response.status(400).send({
        ok: false,
        error: "parentStatementId query parameter is required",
      });
      
return;
    }

    // Get coverage statistics
    const coverage = await embeddingCache.getEmbeddingCoverage(parentStatementId);

    response.status(200).send({
      ok: true,
      status: {
        parentStatementId,
        ...coverage,
        isReady: coverage.coveragePercent >= 50,
        lastUpdated: Date.now(),
      },
    });

  } catch (error) {
    logger.error("Error in getEmbeddingStatus:", error);
    response.status(500).send({
      ok: false,
      error: "Failed to get embedding status",
    });
  }
}

/**
 * Regenerate embedding for a single statement
 * Useful for updating after statement text changes
 */
export async function regenerateEmbedding(
  request: Request,
  response: Response
): Promise<void> {
  const startTime = Date.now();

  try {
    const { statementId } = request.body;

    if (!statementId) {
      response.status(400).send({
        ok: false,
        error: "statementId is required",
      });
      
return;
    }

    // Get the statement
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      response.status(404).send({
        ok: false,
        error: "Statement not found",
      });
      
return;
    }

    const statement = statementDoc.data() as Statement;

    if (!statement.statement || statement.statement.trim().length < 3) {
      response.status(400).send({
        ok: false,
        error: "Statement text is too short for embedding",
      });
      
return;
    }

    // Get parent for context
    let context = "";
    if (statement.parentId && statement.parentId !== "top") {
      const parentDoc = await db
        .collection(Collections.statements)
        .doc(statement.parentId)
        .get();

      if (parentDoc.exists) {
        const parent = parentDoc.data() as Statement;
        context = parent.statement || "";
      }
    }

    // Generate new embedding
    const result = await embeddingService.generateEmbeddingWithRetry(
      statement.statement,
      context
    );

    // Save to statement
    await embeddingCache.saveEmbedding(statementId, result.embedding, context);

    const processingTime = Date.now() - startTime;

    response.status(200).send({
      ok: true,
      result: {
        statementId,
        dimensions: result.dimensions,
        model: result.model,
        processingTimeMs: processingTime,
      },
    });

  } catch (error) {
    logger.error("Error in regenerateEmbedding:", error);
    response.status(500).send({
      ok: false,
      error: "Failed to regenerate embedding",
    });
  }
}

/**
 * Delete embedding from a statement
 * Useful for cleanup or testing
 */
export async function deleteEmbedding(
  request: Request,
  response: Response
): Promise<void> {
  try {
    const { statementId } = request.body;

    if (!statementId) {
      response.status(400).send({
        ok: false,
        error: "statementId is required",
      });
      
return;
    }

    await embeddingCache.deleteEmbedding(statementId);

    response.status(200).send({
      ok: true,
      message: `Embedding deleted for statement ${statementId}`,
    });

  } catch (error) {
    logger.error("Error in deleteEmbedding:", error);
    response.status(500).send({
      ok: false,
      error: "Failed to delete embedding",
    });
  }
}

/**
 * Test embedding generation - DEBUG ENDPOINT
 * Tests if two different texts produce different embeddings
 */
export async function testEmbeddingGeneration(
  request: Request,
  response: Response
): Promise<void> {
  try {
    const { text1, text2, context } = request.body;

    if (!text1 || !text2) {
      response.status(400).send({
        ok: false,
        error: "text1 and text2 are required",
      });
      
return;
    }

    logger.info("=== EMBEDDING TEST START ===", { text1, text2, context });

    // Generate embedding for first text
    logger.info("Generating embedding for text1...");
    const result1 = await embeddingService.generateEmbedding(text1, context);

    // Small delay to ensure no race conditions
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate embedding for second text
    logger.info("Generating embedding for text2...");
    const result2 = await embeddingService.generateEmbedding(text2, context);

    // Compare the embeddings
    const firstValues1 = result1.embedding.slice(0, 10);
    const firstValues2 = result2.embedding.slice(0, 10);

    // Check if they're identical
    let identical = true;
    for (let i = 0; i < firstValues1.length; i++) {
      if (Math.abs(firstValues1[i] - firstValues2[i]) > 0.000001) {
        identical = false;
        break;
      }
    }

    // Calculate cosine similarity
    const similarity = embeddingService.cosineSimilarity(
      result1.embedding,
      result2.embedding
    );

    logger.info("=== EMBEDDING TEST RESULTS ===", {
      text1: text1.substring(0, 30),
      text2: text2.substring(0, 30),
      firstValues1: firstValues1.map(v => v.toFixed(6)),
      firstValues2: firstValues2.map(v => v.toFixed(6)),
      areIdentical: identical,
      cosineSimilarity: similarity.toFixed(4)
    });

    response.status(200).send({
      ok: true,
      result: {
        text1Preview: text1.substring(0, 50),
        text2Preview: text2.substring(0, 50),
        embedding1FirstValues: firstValues1.map(v => v.toFixed(6)),
        embedding2FirstValues: firstValues2.map(v => v.toFixed(6)),
        areEmbeddingsIdentical: identical,
        cosineSimilarity: similarity.toFixed(4),
        dimensions1: result1.embedding.length,
        dimensions2: result2.embedding.length,
        model: result1.model,
      },
    });

  } catch (error) {
    logger.error("Error in testEmbeddingGeneration:", error);
    response.status(500).send({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to test embeddings",
    });
  }
}
