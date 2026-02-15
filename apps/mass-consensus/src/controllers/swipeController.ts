/**
 * Swipe Controller
 * Handles swipe interactions via API routes
 * Following CLAUDE.md guidelines:
 * - Proper error handling with logError()
 * - Named constants
 * - Types from @freedi/shared-types
 */

import { query, where, getDocs, limit as firestoreLimit, orderBy, collection } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { db } from '@/lib/firebase/client';
import { RATING, SWIPE } from '@/constants/common';
import { Collections } from '@freedi/shared-types';

/**
 * Submit a rating for a statement via API route
 * Uses deterministic evaluation IDs (userId--statementId) to prevent duplicates
 * @param parentId - ID of the parent question
 * @param statementId - ID of the statement being rated
 * @param rating - Rating value (-1 to +1)
 * @param userId - ID of the user submitting the rating
 * @param userName - Display name of the user
 */
export async function submitRating(
  parentId: string,
  statementId: string,
  rating: number,
  userId: string,
  userName?: string
): Promise<void> {
  try {
    // Validate rating
    const validRatings: readonly number[] = Object.values(RATING);
    if (!validRatings.includes(rating)) {
      throw new ValidationError('Invalid rating value', {
        rating,
        allowedValues: validRatings,
      });
    }

    // Validate IDs
    if (!parentId || !statementId || !userId) {
      throw new ValidationError('Missing required IDs', {
        parentId,
        statementId,
        userId,
      });
    }

    // Call API route which uses deterministic evaluation IDs
    const response = await fetch(`/api/evaluations/${statementId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evaluation: rating,
        userId,
        userName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit rating');
    }

    console.info('Rating submitted via API:', { parentId, statementId, rating, userId });

  } catch (error) {
    logError(error, {
      operation: 'swipeController.submitRating',
      statementId,
      userId,
      metadata: { rating, parentId },
    });
    throw error;
  }
}

/**
 * Load a batch of statements for swiping
 * @param questionId - ID of the question
 * @param limit - Number of statements to load
 * @param userId - Current user ID
 */
export async function loadCardBatch(
  questionId: string,
  limit: number = SWIPE.BATCH_SIZE,
  userId?: string
): Promise<Statement[]> {
  try {
    if (!questionId) {
      throw new ValidationError('Question ID is required');
    }

    // Query statements that are children of this question
    const statementsRef = collection(db, Collections.statements);
    const q = query(
      statementsRef,
      where('parentId', '==', questionId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limit)
    );

    const snapshot = await getDocs(q);
    const statements: Statement[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as Statement;
      statements.push(data);
    });

    console.info('Loaded statements from Firestore:', {
      questionId,
      count: statements.length,
      userId
    });

    return statements;

  } catch (error) {
    logError(error, {
      operation: 'swipeController.loadCardBatch',
      questionId,
      userId,
      metadata: { limit },
    });
    throw error;
  }
}

/**
 * Sync pending evaluations (offline support)
 * @param parentId - ID of the parent question
 * @param pendingEvaluations - Array of evaluations to sync
 * @param userId - Current user ID
 * @param userName - Display name of the user
 */
export async function syncPendingEvaluations(
  parentId: string,
  pendingEvaluations: Array<{ statementId: string; rating: number; timestamp: number }>,
  userId: string,
  userName?: string
): Promise<void> {
  try {
    if (pendingEvaluations.length === 0) {
      return;
    }

    console.info('Syncing pending evaluations:', {
      count: pendingEvaluations.length,
      userId,
      parentId,
    });

    // Sync each evaluation
    for (const evaluation of pendingEvaluations) {
      try {
        await submitRating(parentId, evaluation.statementId, evaluation.rating, userId, userName);
      } catch (error) {
        logError(error, {
          operation: 'swipeController.syncPendingEvaluations',
          statementId: evaluation.statementId,
          userId,
          metadata: {
            rating: evaluation.rating,
            timestamp: evaluation.timestamp,
            parentId,
          },
        });
        // Continue with next evaluation even if one fails
      }
    }

  } catch (error) {
    logError(error, {
      operation: 'swipeController.syncPendingEvaluations',
      userId,
      metadata: { count: pendingEvaluations.length, parentId },
    });
    throw error;
  }
}

/**
 * Fetch previous evaluation scores for a set of statements
 * @param statementIds - Array of statement IDs to fetch evaluations for
 * @param userId - User ID
 * @returns Map of statementId → rating value
 */
export async function fetchPreviousEvaluations(
  statementIds: string[],
  userId: string
): Promise<Map<string, number>> {
  const evaluationMap = new Map<string, number>();

  try {
    // Fetch evaluations in parallel
    const fetches = statementIds.map(async (statementId) => {
      try {
        const response = await fetch(
          `/api/evaluations/${statementId}?userId=${encodeURIComponent(userId)}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.evaluation?.evaluation !== null && data.evaluation?.evaluation !== undefined) {
            evaluationMap.set(statementId, data.evaluation.evaluation);
          }
        }
      } catch {
        // Silently skip individual fetch failures
      }
    });

    await Promise.all(fetches);
  } catch (error) {
    logError(error, {
      operation: 'swipeController.fetchPreviousEvaluations',
      userId,
      metadata: { statementCount: statementIds.length },
    });
  }

  return evaluationMap;
}
