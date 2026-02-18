// Barrel file: re-exports all survey module functions and types
// so existing imports from '@/lib/firebase/surveys' continue to work.

// Helpers (shared utilities)
export {
  SURVEYS_COLLECTION,
  SURVEY_PROGRESS_COLLECTION,
  DEMOGRAPHIC_QUESTIONS_COLLECTION,
  DEMOGRAPHIC_ANSWERS_COLLECTION,
  stripUndefined,
  generateSurveyId,
  generateProgressId,
  generateDemographicQuestionId,
  generateDemographicAnswerId,
  getStatementIdForSurvey,
} from './surveyHelpers';

// CRUD operations
export {
  createSurvey,
  getSurveyById,
  getSurveyWithQuestions,
  updateSurvey,
  deleteSurvey,
  getSurveysByCreator,
  addQuestionToSurvey,
  removeQuestionFromSurvey,
  reorderSurveyQuestions,
  changeSurveyStatus,
} from './surveyCrud';

// Customization (logos, opening slide)
export {
  updateSurveyOpeningSlide,
  addLogoToSurvey,
  removeLogoFromSurvey,
  updateLogoInSurvey,
  reorderSurveyLogos,
} from './surveyCustomization';

// Queries
export {
  getQuestionsByCreator,
  getQuestionsWithAdminAccess,
  getAvailableQuestions,
  searchQuestions,
  getSurveysByStatus,
} from './surveyQueries';

// Stats
export {
  getBatchSurveyStats,
  getSurveyStats,
} from './surveyStats';
export type { SurveyStatsOptions, SurveyStatsResult } from './surveyStats';

// Progress tracking
export {
  getSurveyProgress,
  upsertSurveyProgress,
  getAllSurveyProgress,
  markOpeningSlideViewed,
} from './surveyProgress';

// Demographic questions
export {
  getSurveyDemographicQuestions,
  getAllSurveyDemographicQuestions,
  createSurveyDemographicQuestion,
  updateSurveyDemographicQuestion,
  deleteSurveyDemographicQuestion,
  batchSaveDemographicQuestions,
} from './surveyDemographics';

// Demographic answers
export {
  saveSurveyDemographicAnswers,
  getSurveyDemographicAnswers,
  getAllSurveyDemographicAnswers,
} from './surveyDemographicAnswers';
export type { SaveDemographicAnswersOptions } from './surveyDemographicAnswers';

// Export data
export { getSurveyExportData } from './surveyExport';
export type { GetSurveyExportDataOptions } from './surveyExport';

// Test data management
export {
  getTestDataCounts,
  clearSurveyTestData,
  markAllDataAsTestData,
  unmarkRetroactiveTestData,
  getRetroactiveTestDataCounts,
} from './surveyTestData';
export type {
  TestDataCounts,
  ClearTestDataResult,
  MarkAllAsTestDataResult,
  UnmarkTestDataResult,
} from './surveyTestData';
