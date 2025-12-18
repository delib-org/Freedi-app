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

export const DEFAULT_QUESTION_OVERRIDE_SETTINGS: QuestionOverrideSettings = {
  allowParticipantsToAddSuggestions: undefined,
  askUserForASolutionBeforeEvaluation: undefined,
  allowSkipping: undefined,
  minEvaluationsPerQuestion: undefined,
  randomizeOptions: undefined,
};
