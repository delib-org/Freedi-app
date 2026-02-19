import { Collections } from '@freedi/shared-types';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '../admin';
import { logger } from '@/lib/utils/logger';
import { getSurveyById } from './surveyCrud';
import {
  SURVEY_PROGRESS_COLLECTION,
  DEMOGRAPHIC_ANSWERS_COLLECTION,
  getStatementIdForSurvey,
} from './surveyHelpers';

export interface TestDataCounts {
  progressCount: number;
  demographicAnswerCount: number;
  total: number;
}

/**
 * Get counts of test data for a survey
 */
export async function getTestDataCounts(surveyId: string): Promise<TestDataCounts> {
  const db = getFirestoreAdmin();

  // Count test progress documents
  const progressSnapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('isTestData', '==', true)
    .get();
  const progressCount = progressSnapshot.size;

  // Count test demographic answers (in usersData, keyed by statementId)
  let demographicAnswerCount = 0;
  const survey = await getSurveyById(surveyId);
  if (survey) {
    const statementId = getStatementIdForSurvey(survey);
    const answersSnapshot = await db
      .collection(DEMOGRAPHIC_ANSWERS_COLLECTION)
      .where('statementId', '==', statementId)
      .where('isTestData', '==', true)
      .get();
    demographicAnswerCount = answersSnapshot.size;
  }

  return {
    progressCount,
    demographicAnswerCount,
    total: progressCount + demographicAnswerCount,
  };
}

export interface ClearTestDataResult {
  success: boolean;
  deletedCounts: TestDataCounts;
}

/**
 * Clear all test data for a survey
 * Deletes progress documents and demographic answers marked as test data
 */
export async function clearSurveyTestData(surveyId: string): Promise<ClearTestDataResult> {
  const db = getFirestoreAdmin();
  const deletedCounts: TestDataCounts = {
    progressCount: 0,
    demographicAnswerCount: 0,
    total: 0,
  };

  try {
    // Get and delete test progress documents
    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('isTestData', '==', true)
      .get();

    // Get and delete test demographic answers (in usersData, keyed by statementId)
    const survey = await getSurveyById(surveyId);
    let answersSnapshot: FirebaseFirestore.QuerySnapshot = { docs: [], size: 0, empty: true } as unknown as FirebaseFirestore.QuerySnapshot;
    if (survey) {
      const statementId = getStatementIdForSurvey(survey);
      answersSnapshot = await db
        .collection(DEMOGRAPHIC_ANSWERS_COLLECTION)
        .where('statementId', '==', statementId)
        .where('isTestData', '==', true)
        .get();
    }

    // Batch delete (Firestore batch limit is 500)
    const BATCH_SIZE = 500;
    const allDocs = [...progressSnapshot.docs, ...answersSnapshot.docs];

    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = allDocs.slice(i, i + BATCH_SIZE);

      for (const doc of batchDocs) {
        batch.delete(doc.ref);
      }

      await batch.commit();
    }

    deletedCounts.progressCount = progressSnapshot.size;
    deletedCounts.demographicAnswerCount = answersSnapshot.size;
    deletedCounts.total = deletedCounts.progressCount + deletedCounts.demographicAnswerCount;

    logger.info(
      '[clearSurveyTestData] Cleared test data for survey:',
      surveyId,
      'deleted:',
      deletedCounts.total
    );

    return { success: true, deletedCounts };
  } catch (error) {
    logger.error('[clearSurveyTestData] Error clearing test data:', surveyId, error);

    return { success: false, deletedCounts };
  }
}

export interface MarkAllAsTestDataResult {
  success: boolean;
  markedCounts: {
    progressCount: number;
    demographicAnswerCount: number;
    evaluationCount: number;
    userEvaluationCount: number;
    total: number;
  };
  markedAt: number;
}

/**
 * Mark all existing live data (progress, demographics, evaluations) as test/pilot data
 * This is useful when admin wants to mark all data collected up to now as pilot data
 * and start fresh for real data collection
 */
export async function markAllDataAsTestData(
  surveyId: string,
  questionIds: string[]
): Promise<MarkAllAsTestDataResult> {
  const db = getFirestoreAdmin();
  const markedAt = Date.now();
  const markedCounts = {
    progressCount: 0,
    demographicAnswerCount: 0,
    evaluationCount: 0,
    userEvaluationCount: 0,
    total: 0,
  };

  try {
    const BATCH_SIZE = 500;

    // 1. Mark all progress documents that are NOT already test data
    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .get();

    // Filter out documents that already have isTestData=true
    const progressDocs = progressSnapshot.docs.filter(
      (doc) => doc.data().isTestData !== true
    );

    // 2. Mark all demographic answers that are NOT already test data
    const survey = await getSurveyById(surveyId);
    let answerDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    if (survey) {
      const statementId = getStatementIdForSurvey(survey);
      const answersSnapshot = await db
        .collection(DEMOGRAPHIC_ANSWERS_COLLECTION)
        .where('statementId', '==', statementId)
        .get();

      answerDocs = answersSnapshot.docs.filter(
        (doc) => doc.data()?.isTestData !== true
      );
    }

    // 3. Mark all evaluations for this survey's questions
    const evaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    const userEvaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];

    for (const questionId of questionIds) {
      const evalSnapshot = await db
        .collection(Collections.evaluations)
        .where('parentId', '==', questionId)
        .get();

      const filteredEvalDocs = evalSnapshot.docs.filter(
        (doc) => doc.data().isTestData !== true
      );
      evaluationDocs.push(...filteredEvalDocs);

      const userEvalSnapshot = await db
        .collection(Collections.userEvaluations)
        .where('parentStatementId', '==', questionId)
        .get();

      const filteredUserEvalDocs = userEvalSnapshot.docs.filter(
        (doc) => doc.data().isTestData !== true
      );
      userEvaluationDocs.push(...filteredUserEvalDocs);
    }

    // Combine all documents to update
    const allDocs = [
      ...progressDocs.map((doc) => ({ ref: doc.ref, type: 'progress' })),
      ...answerDocs.map((doc) => ({ ref: doc.ref, type: 'demographic' })),
      ...evaluationDocs.map((doc) => ({ ref: doc.ref, type: 'evaluation' })),
      ...userEvaluationDocs.map((doc) => ({ ref: doc.ref, type: 'userEvaluation' })),
    ];

    // Batch update all documents
    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = allDocs.slice(i, i + BATCH_SIZE);

      for (const { ref } of batchDocs) {
        batch.update(ref, {
          isTestData: true,
          markedAsTestAt: markedAt,
        });
      }

      await batch.commit();
    }

    // Count by type
    markedCounts.progressCount = progressDocs.length;
    markedCounts.demographicAnswerCount = answerDocs.length;
    markedCounts.evaluationCount = evaluationDocs.length;
    markedCounts.userEvaluationCount = userEvaluationDocs.length;
    markedCounts.total =
      markedCounts.progressCount +
      markedCounts.demographicAnswerCount +
      markedCounts.evaluationCount +
      markedCounts.userEvaluationCount;

    logger.info(
      '[markAllDataAsTestData] Marked data as test for survey:',
      surveyId,
      'counts:',
      markedCounts
    );

    return { success: true, markedCounts, markedAt };
  } catch (error) {
    logger.error('[markAllDataAsTestData] Error marking data as test:', surveyId, error);

    return { success: false, markedCounts, markedAt };
  }
}

export interface UnmarkTestDataResult {
  success: boolean;
  unmarkedCounts: {
    progressCount: number;
    demographicAnswerCount: number;
    evaluationCount: number;
    userEvaluationCount: number;
    total: number;
  };
}

/**
 * Unmark data that was retroactively marked as test data (has markedAsTestAt field)
 * This reverses the markAllDataAsTestData operation
 * Note: Only unmarks data that was RETROACTIVELY marked (has markedAsTestAt),
 * not data that was collected while test mode was ON
 */
export async function unmarkRetroactiveTestData(
  surveyId: string,
  questionIds: string[]
): Promise<UnmarkTestDataResult> {
  const db = getFirestoreAdmin();
  const unmarkedCounts = {
    progressCount: 0,
    demographicAnswerCount: 0,
    evaluationCount: 0,
    userEvaluationCount: 0,
    total: 0,
  };

  try {
    const BATCH_SIZE = 500;

    // 1. Find progress documents that were retroactively marked (have markedAsTestAt)
    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('isTestData', '==', true)
      .get();

    const progressDocs = progressSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    );

    // 2. Find demographic answers that were retroactively marked
    const survey = await getSurveyById(surveyId);
    let answerDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    if (survey) {
      const statementId = getStatementIdForSurvey(survey);
      const answersSnapshot = await db
        .collection(DEMOGRAPHIC_ANSWERS_COLLECTION)
        .where('statementId', '==', statementId)
        .where('isTestData', '==', true)
        .get();

      answerDocs = answersSnapshot.docs.filter(
        (doc) => doc.data()?.markedAsTestAt !== undefined
      );
    }

    // 3. Find evaluations and userEvaluations that were retroactively marked
    const evaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    const userEvaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];

    for (const questionId of questionIds) {
      const evalSnapshot = await db
        .collection(Collections.evaluations)
        .where('parentId', '==', questionId)
        .where('isTestData', '==', true)
        .get();

      const filteredEvalDocs = evalSnapshot.docs.filter(
        (doc) => doc.data().markedAsTestAt !== undefined
      );
      evaluationDocs.push(...filteredEvalDocs);

      const userEvalSnapshot = await db
        .collection(Collections.userEvaluations)
        .where('parentStatementId', '==', questionId)
        .where('isTestData', '==', true)
        .get();

      const filteredUserEvalDocs = userEvalSnapshot.docs.filter(
        (doc) => doc.data().markedAsTestAt !== undefined
      );
      userEvaluationDocs.push(...filteredUserEvalDocs);
    }

    // Combine all documents to update
    const allDocs = [
      ...progressDocs.map((doc) => ({ ref: doc.ref, type: 'progress' })),
      ...answerDocs.map((doc) => ({ ref: doc.ref, type: 'demographic' })),
      ...evaluationDocs.map((doc) => ({ ref: doc.ref, type: 'evaluation' })),
      ...userEvaluationDocs.map((doc) => ({ ref: doc.ref, type: 'userEvaluation' })),
    ];

    // Batch update - remove isTestData and markedAsTestAt using FieldValue.delete()
    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = allDocs.slice(i, i + BATCH_SIZE);

      for (const { ref } of batchDocs) {
        batch.update(ref, {
          isTestData: FieldValue.delete(),
          markedAsTestAt: FieldValue.delete(),
        });
      }

      await batch.commit();
    }

    // Count by type
    unmarkedCounts.progressCount = progressDocs.length;
    unmarkedCounts.demographicAnswerCount = answerDocs.length;
    unmarkedCounts.evaluationCount = evaluationDocs.length;
    unmarkedCounts.userEvaluationCount = userEvaluationDocs.length;
    unmarkedCounts.total =
      unmarkedCounts.progressCount +
      unmarkedCounts.demographicAnswerCount +
      unmarkedCounts.evaluationCount +
      unmarkedCounts.userEvaluationCount;

    logger.info(
      '[unmarkRetroactiveTestData] Unmarked retroactive test data for survey:',
      surveyId,
      'counts:',
      unmarkedCounts
    );

    return { success: true, unmarkedCounts };
  } catch (error) {
    logger.error('[unmarkRetroactiveTestData] Error unmarking test data:', surveyId, error);

    return { success: false, unmarkedCounts };
  }
}

/**
 * Get counts of data that was retroactively marked as pilot (has markedAsTestAt)
 */
export async function getRetroactiveTestDataCounts(
  surveyId: string,
  questionIds: string[]
): Promise<{
  progressCount: number;
  demographicAnswerCount: number;
  evaluationCount: number;
  userEvaluationCount: number;
  total: number;
}> {
  const db = getFirestoreAdmin();

  // Count progress documents with markedAsTestAt
  const progressSnapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('isTestData', '==', true)
    .get();

  const progressCount = progressSnapshot.docs.filter(
    (doc) => doc.data().markedAsTestAt !== undefined
  ).length;

  // Count demographic answers with markedAsTestAt
  let demographicAnswerCount = 0;
  const survey = await getSurveyById(surveyId);
  if (survey) {
    const statementId = getStatementIdForSurvey(survey);
    const answersSnapshot = await db
      .collection(DEMOGRAPHIC_ANSWERS_COLLECTION)
      .where('statementId', '==', statementId)
      .where('isTestData', '==', true)
      .get();

    demographicAnswerCount = answersSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    ).length;
  }

  // Count evaluations and userEvaluations with markedAsTestAt
  let evaluationCount = 0;
  let userEvaluationCount = 0;

  for (const questionId of questionIds) {
    const evalSnapshot = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', questionId)
      .where('isTestData', '==', true)
      .get();

    evaluationCount += evalSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    ).length;

    const userEvalSnapshot = await db
      .collection(Collections.userEvaluations)
      .where('parentStatementId', '==', questionId)
      .where('isTestData', '==', true)
      .get();

    userEvaluationCount += userEvalSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    ).length;
  }

  return {
    progressCount,
    demographicAnswerCount,
    evaluationCount,
    userEvaluationCount,
    total: progressCount + demographicAnswerCount + evaluationCount + userEvaluationCount,
  };
}
