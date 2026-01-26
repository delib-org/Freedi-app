/**
 * Set evaluation for a suggestion statement
 * Direct Firestore write - no API route needed
 * Firebase Function (fn_evaluation.ts) triggers automatically to calculate consensus
 */

import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, Statement } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface SetSuggestionEvaluationParams {
  suggestionId: string;
  userId: string;
  userDisplayName: string;
  evaluation: number; // 1 for upvote, -1 for downvote
}

/**
 * Create or update an evaluation for a suggestion
 * Writes directly to Firestore evaluations collection
 *
 * @returns Promise that resolves when evaluation is saved
 */
export async function setSuggestionEvaluation({
  suggestionId,
  userId,
  userDisplayName,
  evaluation,
}: SetSuggestionEvaluationParams): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();

    // Get the suggestion statement to find its parentId
    const suggestionRef = doc(firestore, Collections.statements, suggestionId);
    const suggestionSnap = await getDoc(suggestionRef);

    if (!suggestionSnap.exists()) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    const suggestionData = suggestionSnap.data() as Statement;
    const parentId = suggestionData.parentId;

    if (!parentId) {
      throw new Error(`Suggestion ${suggestionId} has no parentId`);
    }

    const evaluationId = `${suggestionId}--${userId}`;
    const evaluationRef = doc(firestore, Collections.evaluations, evaluationId);
    const now = Date.now();

    // Match the Evaluation schema from shared-types
    const evaluationData = {
      evaluationId,
      statementId: suggestionId,
      parentId, // Required by schema
      evaluatorId: userId, // Schema uses evaluatorId not userId
      evaluation,
      updatedAt: now, // Schema uses updatedAt
      // Add evaluator object for Firebase Function compatibility
      evaluator: {
        uid: userId,
        displayName: userDisplayName,
        email: '',
        photoURL: '',
        isAnonymous: true,
      },
    };

    await setDoc(evaluationRef, evaluationData, { merge: true });
  } catch (error) {
    logError(error, {
      operation: 'controllers.setSuggestionEvaluation',
      suggestionId,
      userId,
      evaluation,
    });
    throw error;
  }
}

/**
 * Remove an evaluation for a suggestion
 * Deletes from Firestore evaluations collection
 *
 * @returns Promise that resolves when evaluation is deleted
 */
export async function removeSuggestionEvaluation({
  suggestionId,
  userId,
}: {
  suggestionId: string;
  userId: string;
}): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();
    const evaluationId = `${suggestionId}--${userId}`;
    const evaluationRef = doc(firestore, Collections.evaluations, evaluationId);

    await deleteDoc(evaluationRef);
  } catch (error) {
    logError(error, {
      operation: 'controllers.removeSuggestionEvaluation',
      suggestionId,
      userId,
    });
    throw error;
  }
}

/**
 * Get user's evaluation for a suggestion
 * Reads from Firestore evaluations collection
 *
 * @returns The evaluation value (1, -1) or null if no evaluation exists
 */
export async function getUserEvaluation({
  suggestionId,
  userId,
}: {
  suggestionId: string;
  userId: string;
}): Promise<number | null> {
  try {
    const firestore = getFirebaseFirestore();
    const evaluationId = `${suggestionId}--${userId}`;
    const evaluationRef = doc(firestore, Collections.evaluations, evaluationId);

    const { getDoc } = await import('firebase/firestore');
    const evaluationSnap = await getDoc(evaluationRef);

    if (!evaluationSnap.exists()) {
      return null;
    }

    const data = evaluationSnap.data();
    return data.evaluation ?? null;
  } catch (error) {
    logError(error, {
      operation: 'controllers.getUserEvaluation',
      suggestionId,
      userId,
    });
    return null;
  }
}
