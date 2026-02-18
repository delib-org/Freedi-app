import {
  Statement,
  Collections,
  UserDemographicQuestion,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import {
  SurveyExportData,
  QuestionExportData,
  ExportStats,
} from '@/types/export';
import { getAllSolutionsSorted } from '../queries';
import { logger } from '@/lib/utils/logger';
import { getSurveyById } from './surveyCrud';
import { getAllSurveyDemographicQuestions } from './surveyDemographics';
import { getAllSurveyDemographicAnswers } from './surveyDemographicAnswers';
import { getAllSurveyProgress } from './surveyProgress';

export interface GetSurveyExportDataOptions {
  /** Include test data in the export (default: false) */
  includeTestData?: boolean;
}

/**
 * Get complete survey data for export
 * Fetches all survey data including questions, options, responses, and demographics
 */
export async function getSurveyExportData(
  surveyId: string,
  options: GetSurveyExportDataOptions = {}
): Promise<SurveyExportData | null> {
  const { includeTestData = false } = options;
  const db = getFirestoreAdmin();

  logger.info('[getSurveyExportData] Starting export for survey:', surveyId, 'includeTestData:', includeTestData);

  // 1. Get survey configuration
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    logger.error('[getSurveyExportData] Survey not found:', surveyId);

    return null;
  }

  // 2. Fetch all questions
  const questions: QuestionExportData[] = [];
  for (const questionId of survey.questionIds) {
    const questionDoc = await db.collection(Collections.statements).doc(questionId).get();
    if (questionDoc.exists) {
      const question = questionDoc.data() as Statement;
      // Get all options for this question, sorted by consensus
      const optionsData = await getAllSolutionsSorted(questionId, 1000);
      questions.push({
        question,
        options: optionsData,
        optionCount: optionsData.length,
      });
    }
  }

  // 3. Get demographic questions
  const demographicQuestions = await getAllSurveyDemographicQuestions(surveyId);

  // 4. Get all progress records
  const allProgress = await getAllSurveyProgress(surveyId);
  const filteredProgress = includeTestData
    ? allProgress
    : allProgress.filter((p) => p.isTestData !== true);

  // 5. Get all demographic answers
  const allAnswers = await getAllSurveyDemographicAnswers(surveyId);
  const filteredAnswers = includeTestData
    ? allAnswers
    : allAnswers.filter((a) => (a as UserDemographicQuestion & { isTestData?: boolean }).isTestData !== true);

  // 6. Calculate stats
  const totalResponses = filteredProgress.length;
  const completedResponses = filteredProgress.filter((p) => p.isCompleted === true).length;
  const completionRate = totalResponses > 0 ? Math.round((completedResponses / totalResponses) * 100) : 0;

  const stats: ExportStats = {
    totalResponses,
    completedResponses,
    completionRate,
  };

  logger.info('[getSurveyExportData] Export complete:', {
    surveyId,
    questionCount: questions.length,
    demographicQuestionCount: demographicQuestions.length,
    progressCount: filteredProgress.length,
    answersCount: filteredAnswers.length,
  });

  return {
    exportedAt: Date.now(),
    includesTestData: includeTestData,
    survey,
    questions,
    demographicQuestions,
    responses: {
      progress: filteredProgress,
      demographicAnswers: filteredAnswers,
    },
    stats,
  };
}
