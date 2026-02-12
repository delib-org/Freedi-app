/**
 * Suggestion Evaluation Controller
 *
 * Handles voting on paragraph suggestions in the Sign app.
 * Users can vote on suggestions (-1 to 1 scale) which updates consensus scores.
 * Firebase Function (fn_evaluation.ts) auto-triggers to recalculate consensus.
 */

import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, EvaluationSchema, Statement, User } from '@freedi/shared-types';
import { parse, number } from 'valibot';
import { logError, ValidationError } from '@/lib/utils/errorHandling';

/**
 * Set an evaluation for a suggestion
 *
 * This is a direct Firestore write operation. No API route needed.
 * The Firebase Function `fn_evaluation.ts` will trigger automatically
 * to recalculate consensus using the Mean - SEM algorithm.
 *
 * @param suggestion - The suggestion statement being evaluated
 * @param creator - The user creating the evaluation
 * @param evaluation - The evaluation value (-1 to 1)
 * @returns Promise<void>
 *
 * @example
 * await setSuggestionEvaluation(suggestionStatement, currentUser, 0.8);
 */
export async function setSuggestionEvaluation(
  suggestion: Statement,
  creator: User,
  evaluation: number
): Promise<void> {
  try {
    // Validate evaluation value
    parse(number(), evaluation);

    if (evaluation < -1 || evaluation > 1) {
      throw new ValidationError('Evaluation must be between -1 and 1', {
        evaluation,
      });
    }

    // Validate suggestion has a parent (the official paragraph)
    const parentId = suggestion.parentId;
    if (!parentId) {
      throw new ValidationError('Suggestion has no parentId', {
        suggestionId: suggestion.statementId,
      });
    }

    const statementId = suggestion.statementId;
    const evaluationId = `${creator.uid}--${statementId}`;

    // Create evaluation data
    const evaluationData = {
      parentId,
      evaluationId,
      statementId,
      evaluatorId: creator.uid,
      updatedAt: Date.now(),
      evaluation,
      evaluator: creator,
    };

    // Validate against schema
    parse(EvaluationSchema, evaluationData);

    // Write to Firestore
    const db = getFirestoreAdmin();
    const evaluationRef = db.collection(Collections.evaluations).doc(evaluationId);
    await evaluationRef.set(evaluationData);

    console.info('[Suggestion Evaluation] Evaluation set', {
      statementId,
      evaluation,
      userId: creator.uid,
    });
  } catch (error) {
    logError(error, {
      operation: 'suggestions.setSuggestionEvaluation',
      userId: creator.uid,
      documentId: suggestion.topParentId,
      paragraphId: suggestion.parentId,
      metadata: {
        suggestionId: suggestion.statementId,
        evaluation,
      },
    });
    throw error;
  }
}

/**
 * Get user's evaluation for a suggestion
 *
 * @param suggestionId - The suggestion statement ID
 * @param userId - The user ID
 * @returns The evaluation value, or null if not found
 */
export async function getUserSuggestionEvaluation(
  suggestionId: string,
  userId: string
): Promise<number | null> {
  try {
    const evaluationId = `${userId}--${suggestionId}`;
    const db = getFirestoreAdmin();
    const evaluationDoc = await db
      .collection(Collections.evaluations)
      .doc(evaluationId)
      .get();

    if (!evaluationDoc.exists) {
      return null;
    }

    const data = evaluationDoc.data();
    return data?.evaluation ?? null;
  } catch (error) {
    logError(error, {
      operation: 'suggestions.getUserSuggestionEvaluation',
      userId,
      metadata: { suggestionId },
    });
    throw error;
  }
}

/**
 * Remove user's evaluation for a suggestion
 *
 * @param suggestionId - The suggestion statement ID
 * @param userId - The user ID
 */
export async function removeSuggestionEvaluation(
  suggestionId: string,
  userId: string
): Promise<void> {
  try {
    const evaluationId = `${userId}--${suggestionId}`;
    const db = getFirestoreAdmin();
    await db.collection(Collections.evaluations).doc(evaluationId).delete();

    console.info('[Suggestion Evaluation] Evaluation removed', {
      suggestionId,
      userId,
    });
  } catch (error) {
    logError(error, {
      operation: 'suggestions.removeSuggestionEvaluation',
      userId,
      metadata: { suggestionId },
    });
    throw error;
  }
}
