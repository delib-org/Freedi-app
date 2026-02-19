import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '../admin';
import { SurveyProgress } from '@/types/survey';
import { logger } from '@/lib/utils/logger';
import { SURVEY_PROGRESS_COLLECTION, generateProgressId } from './surveyHelpers';

/**
 * Get user's progress for a survey
 */
export async function getSurveyProgress(
  surveyId: string,
  userId: string
): Promise<SurveyProgress | null> {
  const db = getFirestoreAdmin();
  const progressId = generateProgressId(surveyId, userId);

  const doc = await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as SurveyProgress;
}

/**
 * Create or update user's survey progress
 * Uses set(..., { merge: true }) and FieldValue.arrayUnion to eliminate TOCTOU race conditions.
 */
export async function upsertSurveyProgress(
  surveyId: string,
  userId: string,
  updates: {
    currentQuestionIndex?: number;
    completedQuestionId?: string;
    isCompleted?: boolean;
    /** Mark this progress as test data (set when survey is in test mode) */
    isTestData?: boolean;
  }
): Promise<SurveyProgress> {
  const db = getFirestoreAdmin();
  const progressId = generateProgressId(surveyId, userId);
  const now = Date.now();

  // Build the data to merge atomically
  const mergeData: Record<string, unknown> = {
    progressId,
    surveyId,
    userId,
    lastUpdated: now,
  };

  if (updates.currentQuestionIndex !== undefined) {
    mergeData.currentQuestionIndex = updates.currentQuestionIndex;
  }

  if (updates.completedQuestionId) {
    // Use FieldValue.arrayUnion for atomic, idempotent array append
    mergeData.completedQuestionIds = FieldValue.arrayUnion(updates.completedQuestionId);
  }

  if (updates.isCompleted !== undefined) {
    mergeData.isCompleted = updates.isCompleted;
  }

  if (updates.isTestData === true) {
    mergeData.isTestData = true;
  }

  // Use set with merge: true so that:
  // - If document doesn't exist, it creates it with these fields
  // - If it exists, it merges only the specified fields
  // - startedAt and completedQuestionIds (as array) are handled safely
  const docRef = db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId);

  // We still need startedAt on first creation. Use a transaction for that single concern.
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      // First creation: include startedAt and initialize completedQuestionIds
      const newProgress: Record<string, unknown> = {
        ...mergeData,
        startedAt: now,
        // For new documents, set completedQuestionIds as a plain array
        // (FieldValue.arrayUnion works on create too, but we ensure the field exists)
        completedQuestionIds: updates.completedQuestionId ? [updates.completedQuestionId] : [],
        currentQuestionIndex: updates.currentQuestionIndex ?? 0,
        isCompleted: updates.isCompleted ?? false,
      };

      if (updates.isTestData === true) {
        newProgress.isTestData = true;
      }

      transaction.set(docRef, newProgress);
    } else {
      // Existing document: merge updates
      transaction.set(docRef, mergeData, { merge: true });
    }
  });

  logger.info('[upsertSurveyProgress] Upserted progress:', progressId);

  // Read back the current state to return
  const resultDoc = await docRef.get();

  return resultDoc.data() as SurveyProgress;
}

/**
 * Get all survey progress records for a survey (admin use)
 */
export async function getAllSurveyProgress(
  surveyId: string
): Promise<SurveyProgress[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .get();

  const progress = snapshot.docs.map((doc) => doc.data() as SurveyProgress);

  logger.info(
    '[getAllSurveyProgress] Found',
    progress.length,
    'progress records for survey:',
    surveyId
  );

  return progress;
}

/**
 * Mark opening slide as viewed for a user
 */
export async function markOpeningSlideViewed(
  surveyId: string,
  userId: string
): Promise<SurveyProgress> {
  const db = getFirestoreAdmin();
  const progressId = generateProgressId(surveyId, userId);

  const existingProgress = await getSurveyProgress(surveyId, userId);

  if (existingProgress) {
    await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).update({
      hasViewedOpeningSlide: true,
      lastUpdated: Date.now(),
    });

    return {
      ...existingProgress,
      hasViewedOpeningSlide: true,
      lastUpdated: Date.now(),
    };
  } else {
    // Create new progress with opening slide viewed
    const now = Date.now();
    const newProgress: SurveyProgress = {
      progressId,
      surveyId,
      userId,
      currentQuestionIndex: 0,
      completedQuestionIds: [],
      startedAt: now,
      lastUpdated: now,
      isCompleted: false,
      hasViewedOpeningSlide: true,
    };

    await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).set(newProgress);

    return newProgress;
  }
}
