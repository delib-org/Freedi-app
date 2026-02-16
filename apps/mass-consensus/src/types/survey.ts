import { Statement } from '@freedi/shared-types';

// Re-export core types from shared-types
export type {
  Survey,
  SurveySettings,
  SurveyProgress,
  QuestionOverrideSettings,
  SurveyDemographicPage,
  SurveyExplanationPage,
  SurveyLogo,
  UserDemographicQuestion,
} from '@freedi/shared-types';

export {
  SurveyStatus,
  SuggestionMode,
  DisplayMode,
  DEFAULT_SURVEY_SETTINGS,
  DEFAULT_QUESTION_OVERRIDE_SETTINGS,
  SurveyDemographicPageSchema,
  SurveyExplanationPageSchema,
} from '@freedi/shared-types';

// Re-export flow types and utilities
export type {
  FlowItemType,
  BaseFlowItem,
  QuestionFlowItem,
  DemographicFlowItem,
  ExplanationFlowItem,
  SurveyFlowItem,
} from './surveyFlow';

export {
  buildSurveyFlow,
  getTotalFlowLength,
  getFlowItemByIndex,
  findFlowIndexByQuestionId,
  findFlowIndexByDemographicPageId,
  findFlowIndexByExplanationPageId,
  isQuestionFlowItem,
  isDemographicFlowItem,
  isExplanationFlowItem,
  getQuestionNumber,
  getTotalQuestions,
  getDemographicPositionOptions,
} from './surveyFlow';

// Import for local use
import type { Survey, SurveySettings, QuestionOverrideSettings, SurveyDemographicPage, SurveyExplanationPage } from '@freedi/shared-types';

/**
 * Survey with populated question data
 * MC-specific extension that includes resolved questions
 */
export interface SurveyWithQuestions extends Survey {
  questions: Statement[];
}

/**
 * Request body for creating a new survey
 */
export interface CreateSurveyRequest {
  title: string;
  description?: string;
  questionIds?: string[];
  settings?: Partial<SurveySettings>;
  questionSettings?: Record<string, QuestionOverrideSettings>;
  /** Default language for the survey (e.g., 'en', 'he', 'ar') */
  defaultLanguage?: string;
  /** When true, forces all participants to use defaultLanguage regardless of preferences */
  forceLanguage?: boolean;
  /** Demographic page configurations */
  demographicPages?: SurveyDemographicPage[];
  /** Explanation page configurations (markdown content) */
  explanationPages?: SurveyExplanationPage[];
  /** Parent statement ID for inheriting demographic questions */
  parentStatementId?: string;
  /** Custom introduction text to show on welcome screen (replaces default translation) */
  customIntroText?: string;
  /** Whether to show the introduction text on welcome screen (defaults to true) */
  showIntro?: boolean;
}

/**
 * Request body for updating a survey
 */
export interface UpdateSurveyRequest {
  title?: string;
  description?: string;
  questionIds?: string[];
  settings?: Partial<SurveySettings>;
  questionSettings?: Record<string, QuestionOverrideSettings>;
  status?: 'draft' | 'active' | 'closed';
  /** Default language for the survey (e.g., 'en', 'he', 'ar') */
  defaultLanguage?: string;
  /** When true, forces all participants to use defaultLanguage regardless of preferences */
  forceLanguage?: boolean;
  /** Demographic page configurations */
  demographicPages?: SurveyDemographicPage[];
  /** Explanation page configurations (markdown content) */
  explanationPages?: SurveyExplanationPage[];
  /** Parent statement ID for inheriting demographic questions */
  parentStatementId?: string;
  /** Custom introduction text to show on welcome screen (replaces default translation) */
  customIntroText?: string;
  /** Whether to show the introduction text on welcome screen (defaults to true) */
  showIntro?: boolean;
  /** Toggle test mode - when enabled, new responses are marked as test data */
  isTestMode?: boolean;
  /** Array of logos to display on opening slide */
  logos?: import('@freedi/shared-types').SurveyLogo[];
  /** Markdown content for opening slide */
  openingSlideContent?: string;
  /** Whether to show custom opening slide */
  showOpeningSlide?: boolean;
}

/**
 * Request body for uploading a logo
 */
export interface UploadLogoRequest {
  altText: string;
  order?: number;
}

/**
 * Request body for updating logo metadata
 */
export interface UpdateLogoRequest {
  altText?: string;
  order?: number;
  width?: number;
  height?: number;
}

/**
 * Request body for reordering logos
 */
export interface ReorderLogosRequest {
  logoIds: string[];
}

/**
 * Request body for adding a question to a survey
 */
export interface AddQuestionRequest {
  /** Existing question statementId to add */
  questionId?: string;
  /** New question data (if creating) */
  newQuestion?: {
    title: string;
    description?: string;
  };
}

/**
 * Request body for updating survey progress
 */
export interface UpdateProgressRequest {
  currentQuestionIndex: number;
  /** Current index in the unified flow (questions + demographics) */
  currentFlowIndex?: number;
  completedQuestionId?: string;
  /** Demographic page ID that was completed */
  completedDemographicPageId?: string;
  isCompleted?: boolean;
}

/**
 * Response for survey list endpoint
 */
export interface SurveyListResponse {
  surveys: Survey[];
  total: number;
}

/**
 * Response for available questions endpoint
 */
export interface AvailableQuestionsResponse {
  questions: Statement[];
  total: number;
}

/**
 * Test data counts for a survey
 */
export interface TestDataCounts {
  progressCount: number;
  demographicAnswerCount: number;
  total: number;
}

/**
 * Result of clearing test data
 */
export interface ClearTestDataResult {
  success: boolean;
  deletedCounts: TestDataCounts;
}

/**
 * Survey stats with test data breakdown
 */
export interface SurveyStatsResponse {
  responseCount: number;
  completionCount: number;
  completionRate: number;
  /** Test response count (only present if test data exists) */
  testResponseCount?: number;
  /** Test completion count (only present if test data exists) */
  testCompletionCount?: number;
}
