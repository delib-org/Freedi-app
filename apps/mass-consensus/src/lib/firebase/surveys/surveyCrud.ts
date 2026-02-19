import {
  Statement,
  Collections,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import {
  Survey,
  SurveyWithQuestions,
  CreateSurveyRequest,
  UpdateSurveyRequest,
  DEFAULT_SURVEY_SETTINGS,
  SurveyStatus,
} from '@/types/survey';
import { logger } from '@/lib/utils/logger';
import { SURVEYS_COLLECTION, generateSurveyId } from './surveyHelpers';

/**
 * Create a new survey
 */
export async function createSurvey(
  creatorId: string,
  data: CreateSurveyRequest
): Promise<Survey> {
  const db = getFirestoreAdmin();
  const now = Date.now();

  const survey: Survey = {
    surveyId: generateSurveyId(),
    title: data.title,
    description: data.description || '',
    creatorId,
    questionIds: data.questionIds || [],
    settings: {
      ...DEFAULT_SURVEY_SETTINGS,
      ...data.settings,
    },
    questionSettings: data.questionSettings || {},
    status: SurveyStatus.draft,
    createdAt: now,
    lastUpdate: now,
  };

  // Only add optional fields if they have values (Firestore doesn't accept undefined)
  if (data.defaultLanguage !== undefined) {
    survey.defaultLanguage = data.defaultLanguage;
  }
  if (data.forceLanguage !== undefined) {
    survey.forceLanguage = data.forceLanguage;
  }
  if (data.demographicPages !== undefined && data.demographicPages.length > 0) {
    survey.demographicPages = data.demographicPages;
  }
  if (data.explanationPages !== undefined && data.explanationPages.length > 0) {
    survey.explanationPages = data.explanationPages;
  }
  if (data.showEmailSignup !== undefined) {
    survey.showEmailSignup = data.showEmailSignup;
  }
  if (data.customEmailTitle !== undefined) {
    survey.customEmailTitle = data.customEmailTitle;
  }
  if (data.customEmailDescription !== undefined) {
    survey.customEmailDescription = data.customEmailDescription;
  }

  await db.collection(SURVEYS_COLLECTION).doc(survey.surveyId).set(survey);

  logger.info('[createSurvey] Created survey:', survey.surveyId,
    'questionSettings:', JSON.stringify(survey.questionSettings),
    'explanationPages:', survey.explanationPages?.length || 0,
    'demographicPages:', survey.demographicPages?.length || 0
  );

  return survey;
}

/**
 * Get a survey by ID
 */
export async function getSurveyById(surveyId: string): Promise<Survey | null> {
  const db = getFirestoreAdmin();

  const doc = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();

  if (!doc.exists) {
    logger.info('[getSurveyById] Survey not found:', surveyId);

    return null;
  }

  return doc.data() as Survey;
}

/**
 * Get a survey with populated question data
 */
export async function getSurveyWithQuestions(
  surveyId: string
): Promise<SurveyWithQuestions | null> {
  const db = getFirestoreAdmin();

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  // Fetch all questions in parallel (deduplicate IDs)
  const uniqueQuestionIds = [...new Set(survey.questionIds)];
  const questionPromises = uniqueQuestionIds.map(async (questionId) => {
    const doc = await db.collection(Collections.statements).doc(questionId).get();

    return doc.exists ? (doc.data() as Statement) : null;
  });

  const questionsResults = await Promise.all(questionPromises);
  const questions = questionsResults.filter((q): q is Statement => q !== null);

  logger.info('[getSurveyWithQuestions] Loaded', questions.length, 'questions for survey:', surveyId);

  return {
    ...survey,
    questions,
  };
}

/**
 * Update a survey
 */
export async function updateSurvey(
  surveyId: string,
  data: UpdateSurveyRequest
): Promise<Survey | null> {
  const db = getFirestoreAdmin();

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const updates: Partial<Survey> = {
    lastUpdate: Date.now(),
  };

  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.questionIds !== undefined) updates.questionIds = data.questionIds;
  if (data.status !== undefined) updates.status = data.status as SurveyStatus;
  if (data.settings !== undefined) {
    updates.settings = {
      ...survey.settings,
      ...data.settings,
    };
  }
  if (data.questionSettings !== undefined) {
    updates.questionSettings = {
      ...(survey.questionSettings || {}),
      ...data.questionSettings,
    };
  }
  if (data.defaultLanguage !== undefined) {
    updates.defaultLanguage = data.defaultLanguage;
  }
  if (data.forceLanguage !== undefined) {
    updates.forceLanguage = data.forceLanguage;
  }
  if (data.demographicPages !== undefined) {
    updates.demographicPages = data.demographicPages;
  }
  if (data.explanationPages !== undefined) {
    updates.explanationPages = data.explanationPages;
  }
  if (data.parentStatementId !== undefined) {
    updates.parentStatementId = data.parentStatementId;
  }
  if (data.isTestMode !== undefined) {
    updates.isTestMode = data.isTestMode;
  }
  if (data.showIntro !== undefined) {
    updates.showIntro = data.showIntro;
  }
  if (data.customIntroText !== undefined) {
    updates.customIntroText = data.customIntroText;
  }
  if (data.showOpeningSlide !== undefined) {
    updates.showOpeningSlide = data.showOpeningSlide;
  }
  if (data.openingSlideContent !== undefined) {
    updates.openingSlideContent = data.openingSlideContent;
  }
  if (data.logos !== undefined) {
    updates.logos = data.logos;
  }
  if (data.showEmailSignup !== undefined) {
    updates.showEmailSignup = data.showEmailSignup;
  }
  if (data.customEmailTitle !== undefined) {
    updates.customEmailTitle = data.customEmailTitle;
  }
  if (data.customEmailDescription !== undefined) {
    updates.customEmailDescription = data.customEmailDescription;
  }

  await db.collection(SURVEYS_COLLECTION).doc(surveyId).update(updates);

  logger.info('[updateSurvey] Updated survey:', surveyId, 'with updates:', JSON.stringify(updates));

  return {
    ...survey,
    ...updates,
  };
}

/**
 * Delete a survey
 */
export async function deleteSurvey(surveyId: string): Promise<boolean> {
  const db = getFirestoreAdmin();

  try {
    await db.collection(SURVEYS_COLLECTION).doc(surveyId).delete();
    logger.info('[deleteSurvey] Deleted survey:', surveyId);

    return true;
  } catch (error) {
    logger.error('[deleteSurvey] Error deleting survey:', surveyId, error);

    return false;
  }
}

/**
 * Get all surveys created by a user
 * REQUIRES Firestore composite index: creatorId + createdAt (desc)
 */
export async function getSurveysByCreator(creatorId: string): Promise<Survey[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEYS_COLLECTION)
    .where('creatorId', '==', creatorId)
    .orderBy('createdAt', 'desc')
    .get();

  const surveys = snapshot.docs.map((doc) => doc.data() as Survey);
  logger.info('[getSurveysByCreator] Found', surveys.length, 'surveys for creator:', creatorId);

  return surveys;
}

/**
 * Add a question to a survey
 */
export async function addQuestionToSurvey(
  surveyId: string,
  questionId: string
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  // Don't add duplicate
  if (survey.questionIds.includes(questionId)) {
    logger.info('[addQuestionToSurvey] Question already in survey:', questionId);

    return survey;
  }

  const updatedQuestionIds = [...survey.questionIds, questionId];

  return updateSurvey(surveyId, { questionIds: updatedQuestionIds });
}

/**
 * Remove a question from a survey
 */
export async function removeQuestionFromSurvey(
  surveyId: string,
  questionId: string
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const updatedQuestionIds = survey.questionIds.filter((id) => id !== questionId);

  return updateSurvey(surveyId, { questionIds: updatedQuestionIds });
}

/**
 * Reorder questions in a survey
 */
export async function reorderSurveyQuestions(
  surveyId: string,
  newOrder: string[]
): Promise<Survey | null> {
  return updateSurvey(surveyId, { questionIds: newOrder });
}

/**
 * Change survey status (draft -> active -> closed)
 */
export async function changeSurveyStatus(
  surveyId: string,
  newStatus: SurveyStatus
): Promise<Survey | null> {
  return updateSurvey(surveyId, { status: newStatus });
}
