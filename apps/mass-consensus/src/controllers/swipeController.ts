/**
 * Swipe Controller
 * Handles swipe interactions with Firestore
 * Following CLAUDE.md guidelines:
 * - Proper error handling with logError()
 * - Firebase utilities (no manual refs)
 * - Named constants
 * - Types from @freedi/shared-types
 */

import { setDoc, query, where, getDocs, limit as firestoreLimit, orderBy, collection, doc } from 'firebase/firestore';
import { Statement, Evaluation, Collections } from '@freedi/shared-types';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { db } from '@/lib/firebase/client';
import { RATING, SWIPE } from '@/constants/common';

/**
 * Submit a rating for a statement
 * @param parentId - ID of the parent question
 * @param statementId - ID of the statement being rated
 * @param rating - Rating value (-2 to +2)
 * @param userId - ID of the user submitting the rating
 */
export async function submitRating(
  parentId: string,
  statementId: string,
  rating: number,
  userId: string
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

    // Create evaluation document
    const evaluationId = `eval_${userId}_${statementId}_${Date.now()}`;
    const evaluationRef = doc(db, Collections.evaluations, evaluationId);
    const updatedAt = Date.now();

    const evaluation: Evaluation = {
      evaluationId,
      parentId,
      statementId,
      evaluatorId: userId,
      evaluation: rating,
      updatedAt,
    };

    // Save to Firestore
    await setDoc(evaluationRef, evaluation);

    console.info('Rating submitted to Firestore:', { parentId, statementId, rating, userId });

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
 */
export async function syncPendingEvaluations(
  parentId: string,
  pendingEvaluations: Array<{ statementId: string; rating: number; timestamp: number }>,
  userId: string
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
        await submitRating(parentId, evaluation.statementId, evaluation.rating, userId);
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
