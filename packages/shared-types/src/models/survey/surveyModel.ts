import {
  object,
  string,
  boolean,
  number,
  array,
  optional,
  enum_,
  record,
  InferOutput,
} from 'valibot';

import {
  UserQuestionTypeSchema,
  DemographicOptionSchema,
} from '../userDemographic/userDemographicModel';

// ============================================
// Survey Status Enum
// ============================================
export enum SurveyStatus {
  draft = 'draft',
  active = 'active',
  closed = 'closed',
}

export const SurveyStatusSchema = enum_(SurveyStatus);

// ============================================
// Survey Settings Schema
// ============================================
export const SurveySettingsSchema = object({
  /** Can users skip questions without minimum evaluations? */
  allowSkipping: boolean(),
  /** Can users navigate back to previous questions? */
  allowReturning: boolean(),
  /** Minimum evaluations required before "Next" is enabled */
  minEvaluationsPerQuestion: number(),
  /** Show question list on welcome screen */
  showQuestionPreview: optional(boolean()),
  /** Randomize question order per participant */
  randomizeQuestions: optional(boolean()),
  /** Allow participants to add their own suggestions/solutions */
  allowParticipantsToAddSuggestions: optional(boolean()),
});

export type SurveySettings = InferOutput<typeof SurveySettingsSchema>;

// ============================================
// Per-Question Override Settings Schema
// ============================================
export const QuestionOverrideSettingsSchema = object({
  /** Allow participants to add suggestions for THIS question */
  allowParticipantsToAddSuggestions: optional(boolean()),
  /** Ask for suggestion BEFORE seeing options for THIS question */
  askUserForASolutionBeforeEvaluation: optional(boolean()),
  /** Allow skipping THIS question */
  allowSkipping: optional(boolean()),
  /** Minimum evaluations required for THIS question */
  minEvaluationsPerQuestion: optional(number()),
  /** Randomize options order for THIS question */
  randomizeOptions: optional(boolean()),
});

export type QuestionOverrideSettings = InferOutput<typeof QuestionOverrideSettingsSchema>;

// ============================================
// Survey Demographic Question Schema
// ============================================
export const SurveyDemographicQuestionSchema = object({
  /** Unique question ID */
  questionId: string(),
  /** Survey this question belongs to */
  surveyId: string(),
  /** Question text */
  question: string(),
  /** Question type: text, textarea, radio, checkbox */
  type: UserQuestionTypeSchema,
  /** Options for radio/checkbox types */
  options: optional(array(DemographicOptionSchema)),
  /** Display order within the page */
  order: number(),
  /** Whether this question is required */
  required: boolean(),
  createdAt: number(),
  lastUpdate: number(),
});

export type SurveyDemographicQuestion = InferOutput<typeof SurveyDemographicQuestionSchema>;

// ============================================
// Survey Demographic Page Schema
// ============================================
export const SurveyDemographicPageSchema = object({
  /** Unique ID for this demographic page */
  demographicPageId: string(),
  /** Title shown to users (e.g., "About You", "Your Background") */
  title: string(),
  /** Optional description text */
  description: optional(string()),
  /** Position in the survey flow: 0 = before questions, 1-n = after question n, -1 = after all */
  position: number(),
  /** Whether this page is required or can be skipped */
  required: boolean(),
  /** Array of custom demographic question IDs specific to this survey */
  customQuestionIds: array(string()),
  /** Whether to include inherited demographic questions from parent statement */
  includeInheritedQuestions: optional(boolean()),
  /** Array of inherited question IDs to exclude (if includeInheritedQuestions is true) */
  excludedInheritedQuestionIds: optional(array(string())),
});

export type SurveyDemographicPage = InferOutput<typeof SurveyDemographicPageSchema>;

// ============================================
// Survey Demographic Answer Schema
// ============================================
export const SurveyDemographicAnswerSchema = object({
  /** Format: ${surveyId}--${userId}--${questionId} */
  answerId: string(),
  surveyId: string(),
  userId: string(),
  questionId: string(),
  /** For text/textarea/radio questions */
  answer: optional(string()),
  /** For checkbox questions (multiple selections) */
  answerOptions: optional(array(string())),
  createdAt: number(),
  lastUpdate: number(),
});

export type SurveyDemographicAnswer = InferOutput<typeof SurveyDemographicAnswerSchema>;

// ============================================
// Survey Schema (Main Type)
// ============================================
export const SurveySchema = object({
  surveyId: string(),
  title: string(),
  description: optional(string()),
  creatorId: string(),
  /** Ordered array of statementIds (questions) */
  questionIds: array(string()),
  settings: SurveySettingsSchema,
  /** Per-question settings overrides (keyed by questionId) */
  questionSettings: optional(record(string(), QuestionOverrideSettingsSchema)),
  /** Survey lifecycle status */
  status: SurveyStatusSchema,
  /** Total responses started */
  responseCount: optional(number()),
  /** Total completions */
  completionCount: optional(number()),
  /** Default language for the survey (e.g., 'en', 'he', 'ar') */
  defaultLanguage: optional(string()),
  /** When true, forces all participants to use defaultLanguage regardless of preferences */
  forceLanguage: optional(boolean()),
  /** Demographic page configurations */
  demographicPages: optional(array(SurveyDemographicPageSchema)),
  /** Parent statement ID for inheriting demographic questions */
  parentStatementId: optional(string()),
  createdAt: number(),
  lastUpdate: number(),
});

export type Survey = InferOutput<typeof SurveySchema>;

// ============================================
// Survey Progress Schema (User's progress)
// ============================================
export const SurveyProgressSchema = object({
  /** Format: ${surveyId}--${userId} */
  progressId: string(),
  surveyId: string(),
  userId: string(),
  /** 0-based index of current question */
  currentQuestionIndex: number(),
  /** 0-based index in unified flow (questions + demographics) */
  currentFlowIndex: optional(number()),
  /** Array of completed questionIds */
  completedQuestionIds: array(string()),
  /** Array of completed demographic page IDs */
  completedDemographicPageIds: optional(array(string())),
  /** Timestamp when user started the survey */
  startedAt: number(),
  /** Timestamp of last update */
  lastUpdated: number(),
  /** True when user has completed all questions */
  isCompleted: boolean(),
});

export type SurveyProgress = InferOutput<typeof SurveyProgressSchema>;

// ============================================
// Default Settings
// ============================================
export const DEFAULT_SURVEY_SETTINGS: SurveySettings = {
  allowSkipping: false,
  allowReturning: true,
  minEvaluationsPerQuestion: 3,
  showQuestionPreview: false,
  randomizeQuestions: false,
  allowParticipantsToAddSuggestions: false,
};

export const DEFAULT_QUESTION_OVERRIDE_SETTINGS: QuestionOverrideSettings = {
  allowParticipantsToAddSuggestions: undefined,
  askUserForASolutionBeforeEvaluation: undefined,
  allowSkipping: undefined,
  minEvaluationsPerQuestion: undefined,
  randomizeOptions: undefined,
};
