/**
 * Set evaluation for a suggestion statement
 * Direct Firestore write - no API route needed
 * Firebase Function (fn_evaluation.ts) triggers automatically to calculate consensus
 * Also updates positiveEvaluations/negativeEvaluations counts on the statement
 */

import { doc, setDoc, deleteDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, Statement } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Helper to recalculate and update vote counts on a suggestion
 */
async function updateVoteCounts(suggestionId: string): Promise<void> {
  const firestore = getFirebaseFirestore();

  // Query all evaluations for this suggestion
  const evaluationsQuery = query(
    collection(firestore, Collections.evaluations),
    where('statementId', '==', suggestionId)
  );

  const evaluationsSnapshot = await getDocs(evaluationsQuery);

  let positiveEvaluations = 0;
  let negativeEvaluations = 0;

  evaluationsSnapshot.docs.forEach((evalDoc) => {
    const evalData = evalDoc.data();
    const evalValue = evalData.evaluation || 0;

    if (evalValue > 0) {
      positiveEvaluations++;
    } else if (evalValue < 0) {
      negativeEvaluations++;
    }
  });

  // Update the suggestion statement with vote counts
  const suggestionRef = doc(firestore, Collections.statements, suggestionId);
  await updateDoc(suggestionRef, {
    positiveEvaluations,
    negativeEvaluations,
  });
}

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

    // Update vote counts on the suggestion statement
    await updateVoteCounts(suggestionId);
  } catch (error) {
    logError(error, {
      operation: 'controllers.setSuggestionEvaluation',
      userId,
      metadata: { suggestionId, evaluation },
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

    // Update vote counts on the suggestion statement
    await updateVoteCounts(suggestionId);
  } catch (error) {
    logError(error, {
      operation: 'controllers.removeSuggestionEvaluation',
      userId,
      metadata: { suggestionId },
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
      userId,
      metadata: { suggestionId },
    });
    return null;
  }
}
