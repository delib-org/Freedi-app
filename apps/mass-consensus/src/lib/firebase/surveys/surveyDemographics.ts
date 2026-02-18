import { UserDemographicQuestion } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { logger } from '@/lib/utils/logger';
import { getSurveyById } from './surveyCrud';
import {
  DEMOGRAPHIC_QUESTIONS_COLLECTION,
  stripUndefined,
  generateDemographicQuestionId,
  getStatementIdForSurvey,
} from './surveyHelpers';

/**
 * Get demographic questions by their IDs
 * Reads from userDemographicQuestions collection (shared with main app)
 */
export async function getSurveyDemographicQuestions(
  surveyId: string,
  questionIds: string[]
): Promise<UserDemographicQuestion[]> {
  if (!questionIds || questionIds.length === 0) {
    return [];
  }

  const db = getFirestoreAdmin();
  const questions: UserDemographicQuestion[] = [];

  // Firestore 'in' query limit is 30
  const batchSize = 30;

  for (let i = 0; i < questionIds.length; i += batchSize) {
    const batch = questionIds.slice(i, i + batchSize);
    const snapshot = await db
      .collection(DEMOGRAPHIC_QUESTIONS_COLLECTION)
      .where('userQuestionId', 'in', batch)
      .get();

    const batchQuestions = snapshot.docs.map((doc) => doc.data() as UserDemographicQuestion);
    questions.push(...batchQuestions);
  }

  // Sort by order field
  questions.sort((a, b) => (a.order || 0) - (b.order || 0));

  logger.info(
    '[getSurveyDemographicQuestions] Found',
    questions.length,
    'demographic questions for survey:',
    surveyId
  );

  return questions;
}

/**
 * Get all demographic questions for a survey
 * Reads from userDemographicQuestions collection filtered by statementId
 */
export async function getAllSurveyDemographicQuestions(
  surveyId: string
): Promise<UserDemographicQuestion[]> {
  const db = getFirestoreAdmin();

  // Look up survey to get the statementId
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    logger.info('[getAllSurveyDemographicQuestions] Survey not found:', surveyId);

    return [];
  }

  const statementId = getStatementIdForSurvey(survey);

  const snapshot = await db
    .collection(DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .where('statementId', '==', statementId)
    .get();

  const questions = snapshot.docs.map((doc) => doc.data() as UserDemographicQuestion);

  // Sort by order field client-side (avoids needing composite index)
  questions.sort((a, b) => (a.order || 0) - (b.order || 0));

  logger.info(
    '[getAllSurveyDemographicQuestions] Found',
    questions.length,
    'demographic questions for survey:',
    surveyId,
    'statementId:',
    statementId
  );

  return questions;
}

/**
 * Create a new demographic question
 * Writes to userDemographicQuestions collection (shared with main app)
 */
export async function createSurveyDemographicQuestion(
  surveyId: string,
  data: Omit<UserDemographicQuestion, 'userQuestionId' | 'statementId' | 'question'> & { question: string }
): Promise<UserDemographicQuestion> {
  const db = getFirestoreAdmin();

  // Look up survey to get the statementId
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new Error(`Survey not found: ${surveyId}`);
  }

  const statementId = getStatementIdForSurvey(survey);
  const userQuestionId = generateDemographicQuestionId();

  const question: UserDemographicQuestion = stripUndefined({
    userQuestionId,
    statementId,
    topParentId: statementId,
    scope: 'group' as const,
    question: data.question,
    type: data.type,
    options: data.options || [],
    order: data.order,
    required: data.required,
    min: data.min,
    max: data.max,
    step: data.step,
    minLabel: data.minLabel,
    maxLabel: data.maxLabel,
    allowOther: data.allowOther,
  }) as UserDemographicQuestion;

  await db
    .collection(DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .doc(userQuestionId)
    .set(question);

  logger.info(
    '[createSurveyDemographicQuestion] Created demographic question:',
    userQuestionId,
    'for survey:',
    surveyId,
    'statementId:',
    statementId
  );

  return question;
}

/**
 * Update a demographic question
 */
export async function updateSurveyDemographicQuestion(
  questionId: string,
  updates: Partial<UserDemographicQuestion>
): Promise<UserDemographicQuestion | null> {
  const db = getFirestoreAdmin();

  const doc = await db
    .collection(DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .doc(questionId)
    .get();

  if (!doc.exists) {
    logger.info('[updateSurveyDemographicQuestion] Question not found:', questionId);

    return null;
  }

  // Strip undefined values (Firestore doesn't accept undefined)
  const cleanUpdates = stripUndefined(updates as Record<string, unknown>);
  await db.collection(DEMOGRAPHIC_QUESTIONS_COLLECTION).doc(questionId).update(cleanUpdates);

  const updatedDoc = await db
    .collection(DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .doc(questionId)
    .get();

  return updatedDoc.data() as UserDemographicQuestion;
}

/**
 * Delete a demographic question
 */
export async function deleteSurveyDemographicQuestion(questionId: string): Promise<boolean> {
  const db = getFirestoreAdmin();

  try {
    await db.collection(DEMOGRAPHIC_QUESTIONS_COLLECTION).doc(questionId).delete();
    logger.info('[deleteSurveyDemographicQuestion] Deleted question:', questionId);

    return true;
  } catch (error) {
    logger.error('[deleteSurveyDemographicQuestion] Error deleting question:', questionId, error);

    return false;
  }
}

interface BatchQuestionData {
  questionId?: string;
  tempId?: string;
  question: string;
  type: UserDemographicQuestion['type'];
  options?: UserDemographicQuestion['options'];
  order?: number;
  required?: boolean;
  // Range-specific fields
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  allowOther?: boolean;
}

interface BatchSaveResult {
  savedQuestions: UserDemographicQuestion[];
  idMapping: Record<string, string>;
}

/**
 * Batch save demographic questions (create or update) in a single Firestore batch
 * Writes to userDemographicQuestions collection (shared with main app)
 */
export async function batchSaveDemographicQuestions(
  surveyId: string,
  questions: BatchQuestionData[]
): Promise<BatchSaveResult> {
  const db = getFirestoreAdmin();
  const batch = db.batch();
  const savedQuestions: UserDemographicQuestion[] = [];
  const idMapping: Record<string, string> = {};

  // Look up survey to get the statementId
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new Error(`Survey not found: ${surveyId}`);
  }

  const statementId = getStatementIdForSurvey(survey);

  for (const questionData of questions) {
    const isNew = !questionData.questionId || questionData.questionId.startsWith('demo-q-');
    const userQuestionId: string = isNew ? generateDemographicQuestionId() : questionData.questionId!;

    const question: UserDemographicQuestion = stripUndefined({
      userQuestionId,
      statementId,
      topParentId: statementId,
      scope: 'group' as const,
      question: questionData.question,
      type: questionData.type,
      options: questionData.options || [],
      order: questionData.order ?? 0,
      required: questionData.required ?? false,
      min: questionData.min,
      max: questionData.max,
      step: questionData.step,
      minLabel: questionData.minLabel,
      maxLabel: questionData.maxLabel,
      allowOther: questionData.allowOther,
    }) as UserDemographicQuestion;

    const docRef = db.collection(DEMOGRAPHIC_QUESTIONS_COLLECTION).doc(userQuestionId);

    if (isNew) {
      batch.set(docRef, question);
      // Track temp ID mapping
      const tempId = questionData.tempId || questionData.questionId;
      if (tempId) {
        idMapping[tempId] = userQuestionId;
      }
    } else {
      batch.set(docRef, question, { merge: true });
    }

    savedQuestions.push(question);
  }

  await batch.commit();

  logger.info(
    '[batchSaveDemographicQuestions] Saved',
    savedQuestions.length,
    'questions for survey:',
    surveyId,
    'statementId:',
    statementId
  );

  return { savedQuestions, idMapping };
}
