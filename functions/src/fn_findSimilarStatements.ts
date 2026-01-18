import { Request, Response } from "firebase-functions/v1";
import { logger } from "firebase-functions";
import {
  checkForInappropriateContent,
  generateTitleAndDescription,
} from "./services/ai-service";
import {
  getUserStatements,
  convertToSimpleStatements,
  getStatementsByIds,
  removeDuplicateStatement,
  hasReachedMaxStatements,
} from "./services/statement-service";
import {
  getCachedParentStatement,
  getCachedSubStatements,
} from "./services/cached-statement-service";
import {
  getCachedSimilarStatementIds,
  getCachedSimilarityResponse,
  saveCachedSimilarityResponse,
} from "./services/cached-ai-service";
import { vectorSearchService } from "./services/vector-search-service";
import { embeddingCache } from "./services/embedding-cache-service";
import { SimilaritySearchMethod } from "@freedi/shared-types";

/**
 * Optimized Cloud Function to find or generate similar statements.
 * Features:
 * - Parallel database operations
 * - Firestore-based caching for statements
 * - AI response caching
 * - Complete response caching
 */
export async function findSimilarStatements(
  request: Request,
  response: Response
) {
  const startTime = Date.now();

  try {
    const numberOfOptionsToGenerate = 5;
    const { statementId, userInput, creatorId } = request.body;

    // Log request for monitoring
    logger.info("findSimilarStatements request", {
      statementId,
      userInputLength: userInput?.length,
      creatorId,
    });

    // Step 1: Check for inappropriate content (NEVER CACHE THIS!)
    const contentCheck = await checkForInappropriateContent(userInput);

    if (contentCheck.isInappropriate) {
      logger.warn("Inappropriate content detected", { creatorId });
      response.status(400).send({
        ok: false,
        error: "Input contains inappropriate content",
      });

      return;
    }

    // Log if content check had an error but allowed through
    if (contentCheck.error) {
      logger.warn("Content check had error, allowing through", {
        creatorId,
        error: contentCheck.error,
      });
    }

    // Step 2: Get parent statement first to determine threshold for cache key
    const parentStatement = await getCachedParentStatement(statementId);
    if (!parentStatement) {
      logger.error("Parent statement not found", { statementId });
      response.status(404).send({
        ok: false,
        error: "Parent statement not found",
      });
      
return;
    }

    // Get threshold from settings (default 0.75)
    const settings = parentStatement.statementSettings as Record<string, unknown> | undefined;
    const threshold = (settings?.similarityThreshold as number | undefined) ?? 0.75;

    logger.info("Using similarity threshold for cache", { threshold, statementId });

    // Step 3: Try to get complete cached response (with threshold in cache key)
    const cachedResponse = await getCachedSimilarityResponse(
      statementId,
      userInput,
      creatorId,
      threshold
    );

    if (cachedResponse) {
      const cacheTime = Date.now() - startTime;

      // Check if cached response has generatedTitle/Description
      // If not (old cached data), or if it uses the old fallback pattern, regenerate
      let { generatedTitle, generatedDescription } = cachedResponse;

      // Detect if this is a fallback response that should be regenerated
      const isFallbackPattern = generatedDescription?.startsWith("הצעה:") ||
                                generatedDescription?.startsWith("הצעה זו מציעה:") ||
                                generatedDescription?.startsWith("This suggestion proposes:");
      const needsRegeneration = !generatedTitle ||
                                !generatedDescription ||
                                generatedTitle === generatedDescription ||
                                isFallbackPattern;

      if (needsRegeneration) {
        try {
          const generated = await generateTitleAndDescription(userInput, "");
          generatedTitle = generated.title;
          generatedDescription = generated.description;
          logger.info("Generated title/description for cached response", {
            reason: isFallbackPattern ? "fallback_pattern" : "missing_or_identical"
          });
        } catch (genError) {
          logger.warn("Failed to generate title/description for cached response", { error: genError });
          // Use fallback only if we don't already have values - no truncation
          if (!generatedTitle || !generatedDescription) {
            const isHebrew = /[\u0590-\u05FF]/.test(userInput);
            generatedTitle = userInput;
            generatedDescription = isHebrew ? `הצעה זו מציעה: ${userInput}` : `This suggestion proposes: ${userInput}`;
          }
        }
      }

      logger.info("Returning cached response", {
        responseTime: cacheTime,
        type: "full_cache_hit",
      });

      response.status(200).send({
        ...cachedResponse,
        generatedTitle,
        generatedDescription,
        ok: true,
        cached: true,
        responseTime: cacheTime,
      });

      return;
    }

    // Step 4: Process with optimized parallel operations
    const result = await fetchDataAndProcess(
      statementId,
      userInput,
      creatorId,
      numberOfOptionsToGenerate,
      parentStatement,
      threshold
    );

    if (result.error) {
      logger.error("Processing error", {
        error: result.error,
        statusCode: result.statusCode
      });

      response.status(result.statusCode || 500).send({
        ok: false,
        error: result.error,
      });

      return;
    }

    // Step 4: Generate title and description for the user's input
    let generatedTitle = userInput;
    let generatedDescription = userInput;

    try {
      const questionContext = result.parentStatementText || "";
      const generated = await generateTitleAndDescription(userInput, questionContext);
      generatedTitle = generated.title;
      generatedDescription = generated.description;

      logger.info("Generated title and description", {
        titleLength: generatedTitle.length,
        descriptionLength: generatedDescription.length,
      });
    } catch (genError) {
      logger.warn("Failed to generate title/description, using original", { error: genError });
      // Fallback: use full user input without truncation
      generatedTitle = userInput;
    }

    // Step 5: Cache the complete response for future requests
    const responseData = {
      similarStatements: result.cleanedStatements || [],
      userText: result.userText || userInput,
      generatedTitle,
      generatedDescription,
      method: result.searchMethod || "llm",
    };

    await saveCachedSimilarityResponse(
      statementId,
      userInput,
      creatorId,
      responseData,
      threshold
    );

    const totalTime = Date.now() - startTime;
    logger.info("Request completed", {
      responseTime: totalTime,
      type: "computed",
      similarStatementsCount: result.cleanedStatements?.length || 0,
      searchMethod: result.searchMethod || "llm",
    });

    response.status(200).send({
      ...responseData,
      ok: true,
      responseTime: totalTime,
    });

    return;
  } catch (error) {
    const errorTime = Date.now() - startTime;
    // Properly serialize error for logging (some error types don't serialize with { error })
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error) };

    logger.error("Error in findSimilarStatements:", {
      ...errorDetails,
      responseTime: errorTime,
    });

    response.status(500).send({
      ok: false,
      error: "Internal server error",
    });

    return;
  }
}

async function fetchDataAndProcess(
  statementId: string,
  userInput: string,
  creatorId: string,
  numberOfOptionsToGenerate: number,
  parentStatement: { statement: string; statementSettings?: Record<string, unknown> },
  threshold: number
) {
  try {
    // Fetch sub-statements (parent already fetched by caller)
    const subStatements = await getCachedSubStatements(statementId);

    // Prepare data for parallel processing
    const userStatements = getUserStatements(subStatements, creatorId);
    const maxAllowed =
      (parentStatement.statementSettings?.numberOfOptionsPerUser as number | undefined) ?? Infinity;

    // Check validation first
    if (hasReachedMaxStatements(userStatements, maxAllowed)) {
      return {
        error: "You have reached the maximum number of suggestions allowed.",
        statusCode: 403
      };
    }

    logger.info(`Processing similarity check with ${subStatements.length} existing statements, threshold: ${threshold}`);

    // --- Embeddings-First Approach with LLM Fallback ---
    let similarStatementIds: string[] = [];
    let searchMethod: SimilaritySearchMethod = "embedding";
    // Map to store similarity scores by statement ID
    const similarityScores = new Map<string, number>();

    // Try embedding-based search first
    try {
      // Check embedding coverage
      const coverage = await embeddingCache.getEmbeddingCoverage(statementId);

      if (coverage.coveragePercent >= 50) {
        // Use passed threshold (already extracted from settings by caller)
        logger.info("Using similarity threshold for vector search", { threshold });
        const vectorResults = await vectorSearchService.findSimilarToText(
          userInput,
          statementId,
          parentStatement.statement,
          { limit: numberOfOptionsToGenerate, threshold }
        );

        // Store both IDs and similarity scores
        similarStatementIds = vectorResults.map(r => r.statement.statementId);
        vectorResults.forEach(r => {
          similarityScores.set(r.statement.statementId, r.similarity);
        });
        searchMethod = "embedding";

        logger.info("Embedding search completed", {
          resultsFound: similarStatementIds.length,
          coveragePercent: coverage.coveragePercent,
        });

        // If embedding search returns too few results, supplement with LLM
        if (similarStatementIds.length < 3 && subStatements.length > 10) {
          logger.info("Supplementing with LLM search due to few embedding results");
          searchMethod = "hybrid";

          // Convert statements to format with IDs for AI
          const statementsWithIds = convertToSimpleStatements(subStatements).map(s => ({
            id: s.id,
            text: s.statement
          }));

          const llmResults = await getCachedSimilarStatementIds(
            statementsWithIds,
            userInput,
            parentStatement.statement,
            numberOfOptionsToGenerate - similarStatementIds.length
          );

          // Merge results, avoiding duplicates
          const existingIds = new Set(similarStatementIds);
          for (const id of llmResults) {
            if (!existingIds.has(id)) {
              similarStatementIds.push(id);
            }
          }
        }
      } else {
        // Low embedding coverage, fall back to LLM
        logger.info("Low embedding coverage, using LLM search", {
          coveragePercent: coverage.coveragePercent,
        });
        throw new Error("Low embedding coverage");
      }
    } catch (embeddingError) {
      // Fall back to LLM-based search
      searchMethod = "llm";
      logger.info("Falling back to LLM search", {
        reason: embeddingError instanceof Error ? embeddingError.message : "unknown",
      });

      // Convert statements to format with IDs for AI
      const statementsWithIds = convertToSimpleStatements(subStatements).map(s => ({
        id: s.id,
        text: s.statement
      }));

      similarStatementIds = await getCachedSimilarStatementIds(
        statementsWithIds,
        userInput,
        parentStatement.statement,
        numberOfOptionsToGenerate
      );
    }

    logger.info(`Similarity search complete: ${similarStatementIds.length} results via ${searchMethod}`);

    // Get full statements by IDs
    const similarStatements = getStatementsByIds(similarStatementIds, subStatements);

    const { statements: cleanedStatements, duplicateStatement } =
      removeDuplicateStatement(similarStatements, userInput);

    // Add similarity scores to the statements
    const statementsWithSimilarity = cleanedStatements.map(statement => ({
      ...statement,
      similarity: similarityScores.get(statement.statementId) ?? null,
    }));

    return {
      cleanedStatements: statementsWithSimilarity,
      userText: duplicateStatement?.statement || userInput,
      parentStatementText: parentStatement.statement,
      searchMethod,
    };
  } catch (processingError) {
    logger.error("Error in fetchDataAndProcess:", processingError);

    return {
      error: "Failed to process data",
      statusCode: 500
    };
  }
}
