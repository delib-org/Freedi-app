import { Request, Response } from "firebase-functions/v1";
import { logger } from "firebase-functions";
import {
  checkForInappropriateContent,
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

    // Step 2: Try to get complete cached response
    const cachedResponse = await getCachedSimilarityResponse(
      statementId,
      userInput,
      creatorId
    );

    if (cachedResponse) {
      const cacheTime = Date.now() - startTime;
      logger.info("Returning cached response", {
        responseTime: cacheTime,
        type: "full_cache_hit",
      });

      response.status(200).send({
        ...cachedResponse,
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

    // Step 4: Cache the complete response for future requests
    const responseData = {
      similarStatements: result.cleanedStatements || [],
      userText: result.userText || userInput,
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

    // Prepare data for parallel processing
    const userStatements = getUserStatements(subStatements, creatorId);
    const maxAllowed =
      parentStatement.statementSettings?.numberOfOptionsPerUser ?? Infinity;
    const statementSimple = convertToSimpleStatements(subStatements);

    // --- Optimized: Parallel Validation and Cached AI Processing ---
    // Run validation and AI processing in parallel with AI caching
    const [validationResult, similarStatementsAI] = await Promise.all([
      // Validation happens asynchronously
      Promise.resolve(hasReachedMaxStatements(userStatements, maxAllowed)),
      // AI processing with caching
      getCachedSimilarStatements(
        statementSimple.map((s) => s.statement),
        userInput,
        parentStatement.statement,
        numberOfOptionsToGenerate
      )
    ]);

    // Check validation result after parallel processing
    if (validationResult) {
      return {
        error: "You have reached the maximum number of suggestions allowed.",
        statusCode: 403
      };
    }

    const similarStatements = getStatementsFromTexts(
      statementSimple,
      similarStatementsAI,
      subStatements
    );

    const { statements: cleanedStatements, duplicateStatement } =
      removeDuplicateStatement(similarStatements, userInput);

    return {
      cleanedStatements,
      userText: duplicateStatement?.statement || userInput
    };
  } catch (processingError) {
    logger.error("Error in fetchDataAndProcess:", processingError);

    return {
      error: "Failed to process data",
      statusCode: 500
    };
  }
}
