import { Statement } from '@freedi/shared-types';

// Re-export core types from shared-types
export type {
  Survey,
  SurveySettings,
  SurveyProgress,
  QuestionOverrideSettings,
} from '@freedi/shared-types';

export {
  SurveyStatus,
  DEFAULT_SURVEY_SETTINGS,
  DEFAULT_QUESTION_OVERRIDE_SETTINGS,
} from '@freedi/shared-types';

// Import for local use
import type { Survey, SurveySettings, QuestionOverrideSettings } from '@freedi/shared-types';

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
  completedQuestionId?: string;
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
