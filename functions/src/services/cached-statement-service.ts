import { Statement } from '@freedi/shared-types';
import { cache } from "./cache-service";
import {
  getParentStatement,
  getSubStatements,
} from "./statement-service";
import { logger } from "firebase-functions";

/**
 * Fetches a parent statement with caching
 * @param statementId - The ID of the statement to fetch
 * @returns The parent statement or null if not found
 */
export async function getCachedParentStatement(
  statementId: string
): Promise<Statement | null> {
  const cacheKey = cache.generateKey("parent", statementId);

  try {
    // Try cache first
    const cached = await cache.get<Statement>(cacheKey);
    if (cached) {
      logger.info(`Cache hit for parent statement: ${statementId}`);

return cached;
    }

    // Fetch from database
    const statement = await getParentStatement(statementId);

    if (statement) {
      // Cache for 2 minutes (settings may change frequently)
      await cache.set(cacheKey, statement, 2);
      logger.info(`Cached parent statement: ${statementId}`);
    }

    return statement;
  } catch (error) {
    logger.error(`Error in getCachedParentStatement for ${statementId}:`, error);
    // Fall back to direct database fetch on error

return getParentStatement(statementId);
  }
}

/**
 * Fetches sub-statements with caching
 * @param parentId - The parent statement ID
 * @returns Array of sub-statements
 */
export async function getCachedSubStatements(
  parentId: string
): Promise<Statement[]> {
  const cacheKey = cache.generateKey("subs", parentId);

  try {
    // Try cache first
    const cached = await cache.get<Statement[]>(cacheKey);
    if (cached) {
      logger.info(`Cache hit for sub-statements: ${parentId}`);

return cached;
    }

    // Fetch from database
    const statements = await getSubStatements(parentId);

    if (statements && statements.length > 0) {
      // Cache for 2 minutes (sub-statements change more frequently)
      await cache.set(cacheKey, statements, 2);
      logger.info(`Cached ${statements.length} sub-statements for: ${parentId}`);
    }

    return statements;
  } catch (error) {
    logger.error(`Error in getCachedSubStatements for ${parentId}:`, error);
    // Fall back to direct database fetch on error

return getSubStatements(parentId);
  }
}

/**
 * Invalidates cache for a specific statement
 * Call this when a statement is updated
 * @param statementId - The statement ID to invalidate
 * @param isParent - Whether this is a parent statement
 */
export async function invalidateStatementCache(
  statementId: string,
  isParent: boolean = true
): Promise<void> {
  try {
    if (isParent) {
      // Invalidate parent statement cache
      const parentKey = cache.generateKey("parent", statementId);
      await cache.delete(parentKey);

      // Also invalidate sub-statements cache for this parent
      const subsKey = cache.generateKey("subs", statementId);
      await cache.delete(subsKey);

      logger.info(`Invalidated cache for parent statement: ${statementId}`);
    } else {
      // For sub-statements, we need to invalidate the parent's sub-statements cache
      // This would require knowing the parent ID, which might need to be passed in
      logger.info(`Sub-statement cache invalidation requested for: ${statementId}`);
    }
  } catch (error) {
    logger.error(`Error invalidating cache for ${statementId}:`, error);
  }
}

/**
 * Warms up the cache by pre-loading frequently accessed statements
 * This could be called periodically or on specific triggers
 * @param statementIds - Array of statement IDs to pre-cache
 */
export async function warmupCache(statementIds: string[]): Promise<void> {
  try {
    logger.info(`Warming up cache for ${statementIds.length} statements`);

    // Use Promise.all for parallel warming
    const warmupPromises = statementIds.map(async (id) => {
      await Promise.all([
        getCachedParentStatement(id),
        getCachedSubStatements(id),
      ]);
    });

    await Promise.all(warmupPromises);

    logger.info("Cache warmup completed");
  } catch (error) {
    logger.error("Error during cache warmup:", error);
  }
}