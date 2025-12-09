import { Statement } from 'delib-npm';

/**
 * Survey settings for controlling user experience
 */
export interface SurveySettings {
  /** Can users skip questions without minimum evaluations? */
  allowSkipping: boolean;
  /** Can users navigate back to previous questions? */
  allowReturning: boolean;
  /** Minimum evaluations required before "Next" is enabled (default: 3) */
  minEvaluationsPerQuestion: number;
}

/**
 * Survey - A collection of linked MC questions
 * Stored in `surveys` collection
 */
export interface Survey {
  surveyId: string;
  title: string;
  description?: string;
  creatorId: string;
  /** Ordered array of statementIds (questions) */
  questionIds: string[];
  settings: SurveySettings;
  createdAt: number;
  lastUpdate: number;
  isActive: boolean;
}

/**
 * Survey with populated question data
 */
export interface SurveyWithQuestions extends Survey {
  questions: Statement[];
}

/**
 * Survey progress - Tracks user's progress through a survey
 * Stored in `surveyProgress` collection
 * Document ID format: `${surveyId}--${userId}`
 */
export interface SurveyProgress {
  progressId: string;
  surveyId: string;
  userId: string;
  /** 0-based index of current question */
  currentQuestionIndex: number;
  /** Array of completed questionIds */
  completedQuestionIds: string[];
  /** Timestamp when user started the survey */
  startedAt: number;
  /** Timestamp of last update */
  lastUpdated: number;
  /** True when user has completed all questions */
  isCompleted: boolean;
}

/**
 * Default survey settings
 */
export const DEFAULT_SURVEY_SETTINGS: SurveySettings = {
  allowSkipping: false,
  allowReturning: true,
  minEvaluationsPerQuestion: 3,
};

/**
 * Request body for creating a new survey
 */
export interface CreateSurveyRequest {
  title: string;
  description?: string;
  questionIds?: string[];
  settings?: Partial<SurveySettings>;
}

/**
 * Request body for updating a survey
 */
export interface UpdateSurveyRequest {
  title?: string;
  description?: string;
  questionIds?: string[];
  settings?: Partial<SurveySettings>;
  isActive?: boolean;
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
