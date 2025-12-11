import {
  object,
  string,
  boolean,
  number,
  array,
  optional,
  enum_,
  InferOutput,
} from 'valibot';

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
  /** Survey lifecycle status */
  status: SurveyStatusSchema,
  /** Total responses started */
  responseCount: optional(number()),
  /** Total completions */
  completionCount: optional(number()),
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
  /** Array of completed questionIds */
  completedQuestionIds: array(string()),
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
