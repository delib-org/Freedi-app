import { cache } from "./cache-service";
import { findSimilarStatementsAI } from "./ai-service";
import { logger } from "firebase-functions";

/**
 * Finds similar statements with caching to reduce AI API calls
 * @param statements - Array of statement texts to search through
 * @param userInput - The user's input text
 * @param question - The parent question/context
 * @param numberOfSimilarStatements - Number of similar statements to find
 * @returns Array of similar statement texts
 */
export async function getCachedSimilarStatements(
  statements: string[],
  userInput: string,
  question: string,
  numberOfSimilarStatements: number = 6
): Promise<string[]> {
  // Create a deterministic cache key based on inputs
  // We use a subset of the input to keep the key reasonable
  const cacheKey = cache.generateKey(
    "similar",
    question.substring(0, 30), // First 30 chars of question
    userInput.substring(0, 50), // First 50 chars of user input
    statements.length.toString(), // Number of statements
    numberOfSimilarStatements.toString(), // Number requested
    // Add a hash of the first few statements for uniqueness
    statements.slice(0, 3).join(",").substring(0, 30)
  );

  try {
    // Try cache first
    const cached = await cache.get<string[]>(cacheKey);
    if (cached) {
      logger.info("Cache hit for similar statements AI");

      return cached;
    }

    // Call AI service
    const results = await findSimilarStatementsAI(
      statements,
      userInput,
      question,
      numberOfSimilarStatements
    );

    // Cache for 15 minutes (AI results are expensive)
    if (results && results.length > 0) {
      await cache.set(cacheKey, results, 15);
      logger.info(`Cached AI response with ${results.length} similar statements`);
    }

    return results;
  } catch (error) {
    logger.error("Error in getCachedSimilarStatements:", error);
    // Fall back to direct AI call on cache error
    return findSimilarStatementsAI(
      statements,
      userInput,
      question,
      numberOfSimilarStatements
    );
  }
}

/**
 * Complete cached response for the entire similarity search
 * Caches the final processed result to avoid reprocessing
 */
export async function getCachedSimilarityResponse(
  statementId: string,
  userInput: string,
  creatorId: string
): Promise<{ similarStatements: any[]; userText: string } | null> {
  const cacheKey = cache.generateKey(
    "full_response",
    statementId,
    userInput.substring(0, 50),
    creatorId
  );

  try {
    const cached = await cache.get<{ similarStatements: any[]; userText: string }>(
      cacheKey
    );

    if (cached) {
      logger.info("Cache hit for complete similarity response");

      return cached;
    }

    return null;
  } catch (error) {
    logger.error("Error getting cached similarity response:", error);

    return null;
  }
}

/**
 * Saves a complete similarity response to cache
 */
export async function saveCachedSimilarityResponse(
  statementId: string,
  userInput: string,
  creatorId: string,
  response: { similarStatements: any[]; userText: string }
): Promise<void> {
  const cacheKey = cache.generateKey(
    "full_response",
    statementId,
    userInput.substring(0, 50),
    creatorId
  );

  try {
    // Cache for 5 minutes (complete responses)
    await cache.set(cacheKey, response, 5);
    logger.info("Cached complete similarity response");
  } catch (error) {
    logger.error("Error saving cached similarity response:", error);
  }
}

/**
 * Invalidates AI-related caches for a specific statement
 * Call this when statements are updated or new ones are added
 */
export async function invalidateAICache(parentId: string): Promise<void> {
  try {
    // Since we can't easily identify all related cache keys,
    // we might need to implement a more sophisticated invalidation strategy
    // For now, log the invalidation request
    logger.info(`AI cache invalidation requested for parent: ${parentId}`);

    // In a production system, you might want to:
    // 1. Keep track of cache keys per statement in a separate collection
    // 2. Use cache tags/groups for bulk invalidation
    // 3. Implement a shorter TTL and accept some stale data
  } catch (error) {
    logger.error("Error invalidating AI cache:", error);
  }
}