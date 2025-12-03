import { Request, Response } from "firebase-functions/v1";
import { logger } from "firebase-functions";
import {
  checkForInappropriateContent,
  generateTitleAndDescription,
} from "./services/ai-service";
import {
  getUserStatements,
  convertToSimpleStatements,
  getStatementsFromTexts,
  removeDuplicateStatement,
  hasReachedMaxStatements,
} from "./services/statement-service";
import {
  getCachedParentStatement,
  getCachedSubStatements,
} from "./services/cached-statement-service";
import {
  getCachedSimilarStatements,
  getCachedSimilarityResponse,
  saveCachedSimilarityResponse,
} from "./services/cached-ai-service";
import { findSimilarByVector } from "./services/vector-search-service";

/**
 * Optimized Cloud Function to find or generate similar statements.
 * Features:
 * - Hybrid search: Vector search first, AI fallback
 * - Parallel database operations
 * - Firestore-based caching for statements
 * - AI response caching
 * - Complete response caching
 *
 * The function uses a hybrid approach:
 * 1. First tries vector search using Firestore embeddings (faster, more accurate)
 * 2. Falls back to AI-based similarity search if no vector results found
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

    // Step 2: Try to get complete cached response
    const cachedResponse = await getCachedSimilarityResponse(
      statementId,
      userInput,
      creatorId
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
          // Use fallback only if we don't already have values
          if (!generatedTitle || !generatedDescription) {
            const isHebrew = /[\u0590-\u05FF]/.test(userInput);
            generatedTitle = userInput.length > 60 ? userInput.substring(0, 57) + "..." : userInput;
            generatedDescription = userInput.length > 60 ? userInput :
              (isHebrew ? `הצעה זו מציעה: ${userInput}` : `This suggestion proposes: ${userInput}`);
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

    // Step 3: Process with optimized parallel operations
    const result = await fetchDataAndProcess(
      statementId,
      userInput,
      creatorId,
      numberOfOptionsToGenerate
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
      // Fallback: truncate for title if too long
      if (userInput.length > 80) {
        generatedTitle = userInput.substring(0, 77) + "...";
      }
    }

    // Step 5: Cache the complete response for future requests
    const responseData = {
      similarStatements: result.cleanedStatements || [],
      userText: result.userText || userInput,
      generatedTitle,
      generatedDescription,
    };

    await saveCachedSimilarityResponse(
      statementId,
      userInput,
      creatorId,
      responseData
    );

    const totalTime = Date.now() - startTime;
    logger.info("Request completed", {
      responseTime: totalTime,
      type: "computed",
      similarStatementsCount: result.cleanedStatements?.length || 0,
    });

    response.status(200).send({
      ...responseData,
      ok: true,
      responseTime: totalTime,
    });

    return;
  } catch (error) {
    const errorTime = Date.now() - startTime;
    logger.error("Error in findSimilarStatements:", {
      error,
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
  numberOfOptionsToGenerate: number
) {
  try {
    // --- Optimized: Parallel Database Operations with Caching ---
    // Fetch parent statement and sub-statements in parallel with caching
    const [parentStatement, subStatements] = await Promise.all([
      getCachedParentStatement(statementId),
      getCachedSubStatements(statementId)
    ]);

    // Validate parent statement
    if (!parentStatement) {
      return {
        error: "Parent statement not found",
        statusCode: 404
      };
    }

    // Prepare data for validation
    const userStatements = getUserStatements(subStatements, creatorId);
    const maxAllowed =
      parentStatement.statementSettings?.numberOfOptionsPerUser ?? Infinity;

    // Check if user has reached max statements
    if (hasReachedMaxStatements(userStatements, maxAllowed)) {
      return {
        error: "You have reached the maximum number of suggestions allowed.",
        statusCode: 403
      };
    }

    // --- Hybrid Search: Vector Search First, AI Fallback ---
    let similarStatements: ReturnType<typeof getStatementsFromTexts> = [];

    // Try vector search first (faster and more accurate when embeddings exist)
    try {
      const vectorResults = await findSimilarByVector(userInput, {
        parentId: statementId,
        limit: numberOfOptionsToGenerate,
        minSimilarity: 0.6,
      });

      if (vectorResults.length > 0) {
        // Vector search found results - use them directly
        logger.info("Using vector search results", {
          count: vectorResults.length,
          statementId,
        });

        similarStatements = vectorResults.map((result) => result.statementData);
      }
    } catch (vectorError) {
      logger.warn("Vector search failed, falling back to AI", {
        error: vectorError,
        statementId,
      });
    }

    // Fallback to AI-based search if vector search returned no results
    if (similarStatements.length === 0) {
      logger.info("Falling back to AI-based similarity search", { statementId });

      const statementSimple = convertToSimpleStatements(subStatements);

      const similarStatementsAI = await getCachedSimilarStatements(
        statementSimple.map((s) => s.statement),
        userInput,
        parentStatement.statement,
        numberOfOptionsToGenerate
      );

      similarStatements = getStatementsFromTexts(
        statementSimple,
        similarStatementsAI,
        subStatements
      );
    }

    const { statements: cleanedStatements, duplicateStatement } =
      removeDuplicateStatement(similarStatements, userInput);

    return {
      cleanedStatements,
      userText: duplicateStatement?.statement || userInput,
      parentStatementText: parentStatement.statement,
    };
  } catch (processingError) {
    logger.error("Error in fetchDataAndProcess:", processingError);

    return {
      error: "Failed to process data",
      statusCode: 500
    };
  }
}
