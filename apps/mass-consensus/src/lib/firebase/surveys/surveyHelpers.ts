import { Collections } from '@freedi/shared-types';
import { Survey } from '@/types/survey';

/** Collection name for surveys */
export const SURVEYS_COLLECTION = 'surveys';
/** Collection name for survey progress */
export const SURVEY_PROGRESS_COLLECTION = 'surveyProgress';
/** Collection name for demographic questions (shared with main app) */
export const DEMOGRAPHIC_QUESTIONS_COLLECTION = Collections.userDemographicQuestions;
/** Collection name for demographic answers (shared with main app) */
export const DEMOGRAPHIC_ANSWERS_COLLECTION = Collections.usersData;

/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 * Returns a new object with only defined values
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T;
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }

  return result;
}

/**
 * Generate a unique survey ID
 */
export function generateSurveyId(): string {
  return `survey_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate progress document ID
 */
export function generateProgressId(surveyId: string, userId: string): string {
  return `${surveyId}--${userId}`;
}

/**
 * Generate a unique demographic question ID
 */
export function generateDemographicQuestionId(): string {
  return `demq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate demographic answer ID (shared format with main app)
 */
export function generateDemographicAnswerId(userQuestionId: string, userId: string): string {
  return `${userQuestionId}--${userId}`;
}

/**
 * Get the statementId for a survey's demographic questions.
 * Uses parentStatementId if available, falling back to surveyId.
 *
 * IMPORTANT: Always use surveyId as fallback (not questionIds[0]) because
 * surveyId is stable. Using questionIds[0] caused a bug where demographic
 * questions saved before any survey questions were added (statementId = surveyId)
 * became unfindable once questions were added (lookup switched to questionIds[0]).
 */
export function getStatementIdForSurvey(survey: Survey): string {
  if (survey.parentStatementId) {
    return survey.parentStatementId;
  }

  return survey.surveyId;
}
