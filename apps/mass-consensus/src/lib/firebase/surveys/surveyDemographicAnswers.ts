import { UserDemographicQuestion } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { logger } from '@/lib/utils/logger';
import { getSurveyById } from './surveyCrud';
import {
  DEMOGRAPHIC_QUESTIONS_COLLECTION,
  DEMOGRAPHIC_ANSWERS_COLLECTION,
  stripUndefined,
  generateDemographicAnswerId,
  getStatementIdForSurvey,
} from './surveyHelpers';

export interface SaveDemographicAnswersOptions {
  /** Mark answers as test data (set when survey is in test mode) */
  isTestData?: boolean;
}

/**
 * Save demographic answers for a user
 * Stores answers in usersData collection (shared with main app)
 * Each answer is stored as a UserDemographicQuestion with answer fields filled in
 */
export async function saveSurveyDemographicAnswers(
  surveyId: string,
  userId: string,
  answers: Array<{
    questionId: string;
    answer?: string;
    answerOptions?: string[];
    otherText?: string;
  }>,
  options: SaveDemographicAnswersOptions = {}
): Promise<UserDemographicQuestion[]> {
  const db = getFirestoreAdmin();
  const savedAnswers: UserDemographicQuestion[] = [];

  // Look up survey to get the statementId
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new Error(`Survey not found: ${surveyId}`);
  }

  const statementId = getStatementIdForSurvey(survey);

  // Fetch questions so we can build the full answer documents
  const questionIds = answers.map((a) => a.questionId);
  const questionDocs: Map<string, UserDemographicQuestion> = new Map();

  const batchSize = 30;
  for (let i = 0; i < questionIds.length; i += batchSize) {
    const idBatch = questionIds.slice(i, i + batchSize);
    const snapshot = await db
      .collection(DEMOGRAPHIC_QUESTIONS_COLLECTION)
      .where('userQuestionId', 'in', idBatch)
      .get();

    for (const doc of snapshot.docs) {
      const q = doc.data() as UserDemographicQuestion;
      if (q.userQuestionId) {
        questionDocs.set(q.userQuestionId, q);
      }
    }
  }

  const writeBatch = db.batch();

  for (const answerData of answers) {
    const questionDoc = questionDocs.get(answerData.questionId);
    const answerId = generateDemographicAnswerId(answerData.questionId, userId);

    // Build the answer document: question fields + answer fields
    const answerDoc: Record<string, unknown> = {
      ...(questionDoc || {}),
      userQuestionId: answerData.questionId,
      statementId,
      topParentId: statementId,
      userId,
      answer: answerData.answer,
      answerOptions: answerData.answerOptions,
      otherText: answerData.otherText,
    };

    // Add test data flag if in test mode
    if (options.isTestData === true) {
      answerDoc.isTestData = true;
    }

    // Strip undefined values
    const cleanDoc = stripUndefined(answerDoc as Record<string, unknown>);

    const docRef = db.collection(DEMOGRAPHIC_ANSWERS_COLLECTION).doc(answerId);
    writeBatch.set(docRef, cleanDoc, { merge: true });
    savedAnswers.push(cleanDoc as UserDemographicQuestion);
  }

  await writeBatch.commit();

  logger.info(
    '[saveSurveyDemographicAnswers] Saved',
    savedAnswers.length,
    'answers for user:',
    userId,
    'survey:',
    surveyId,
    options.isTestData ? '(test data)' : ''
  );

  return savedAnswers;
}

/**
 * Get demographic answers for a user in a survey
 * Reads from usersData collection filtered by statementId + userId
 */
export async function getSurveyDemographicAnswers(
  surveyId: string,
  userId: string
): Promise<UserDemographicQuestion[]> {
  const db = getFirestoreAdmin();

  // Look up survey to get the statementId
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    logger.info('[getSurveyDemographicAnswers] Survey not found:', surveyId);

    return [];
  }

  const statementId = getStatementIdForSurvey(survey);

  const snapshot = await db
    .collection(DEMOGRAPHIC_ANSWERS_COLLECTION)
    .where('statementId', '==', statementId)
    .where('userId', '==', userId)
    .get();

  const answers = snapshot.docs.map((doc) => doc.data() as UserDemographicQuestion);

  logger.info(
    '[getSurveyDemographicAnswers] Found',
    answers.length,
    'answers for user:',
    userId,
    'survey:',
    surveyId
  );

  return answers;
}

/**
 * Get all demographic answers for a survey (admin use)
 * Reads from usersData collection filtered by statementId
 */
export async function getAllSurveyDemographicAnswers(
  surveyId: string
): Promise<UserDemographicQuestion[]> {
  const db = getFirestoreAdmin();

  // Look up survey to get the statementId
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    logger.info('[getAllSurveyDemographicAnswers] Survey not found:', surveyId);

    return [];
  }

  const statementId = getStatementIdForSurvey(survey);

  const snapshot = await db
    .collection(DEMOGRAPHIC_ANSWERS_COLLECTION)
    .where('statementId', '==', statementId)
    .get();

  const answers = snapshot.docs.map((doc) => doc.data() as UserDemographicQuestion);

  logger.info(
    '[getAllSurveyDemographicAnswers] Found',
    answers.length,
    'total answers for survey:',
    surveyId
  );

  return answers;
}
