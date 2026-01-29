/**
 * Set evaluation for a suggestion statement
 * Uses API route to bypass Firestore security rules and update vote counts
 */

import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface SetSuggestionEvaluationParams {
  suggestionId: string;
  userId: string;
  userDisplayName: string;
  evaluation: number; // 1 for upvote, -1 for downvote
}

/**
 * Create or update an evaluation for a suggestion
 * Uses API route which updates both evaluation and vote counts
 *
 * @returns Promise that resolves when evaluation is saved
 */
export async function setSuggestionEvaluation({
  suggestionId,
  evaluation,
}: SetSuggestionEvaluationParams): Promise<void> {
  try {
    const response = await fetch(`/api/suggestion-evaluations/${suggestionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ evaluation }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to set evaluation');
    }
  } catch (error) {
    logError(error, {
      operation: 'controllers.setSuggestionEvaluation',
      metadata: { suggestionId, evaluation },
    });
    throw error;
  }
}

/**
 * Remove an evaluation for a suggestion
 * Uses API route which updates vote counts after deletion
 *
 * @returns Promise that resolves when evaluation is deleted
 */
export async function removeSuggestionEvaluation({
  suggestionId,
}: {
  suggestionId: string;
  userId: string;
}): Promise<void> {
  try {
    const response = await fetch(`/api/suggestion-evaluations/${suggestionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to remove evaluation');
    }
  } catch (error) {
    logError(error, {
      operation: 'controllers.removeSuggestionEvaluation',
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
