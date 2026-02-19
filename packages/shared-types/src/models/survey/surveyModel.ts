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
// Survey Logo Schema
// ============================================
export const SurveyLogoSchema = object({
  /** Unique logo identifier */
  logoId: string(),
  /** Firebase Storage path (e.g., surveys/{surveyId}/logos/{filename}) */
  storageUrl: string(),
  /** Public URL for displaying the logo */
  publicUrl: string(),
  /** Alt text for accessibility */
  altText: string(),
  /** Display order (lower numbers first) */
  order: number(),
  /** Optional width constraint in pixels */
  width: optional(number()),
  /** Optional height constraint in pixels */
  height: optional(number()),
  /** Timestamp when logo was uploaded */
  uploadedAt: number(),
});

export type SurveyLogo = InferOutput<typeof SurveyLogoSchema>;

// ============================================
// Suggestion Mode Enum
// Controls UX friction when adding new suggestions vs merging
// ============================================
export enum SuggestionMode {
  /** Easy to add new - "Add as New" is primary, no confirmation modal */
  encourage = 'encourage',
  /** Equal options - both buttons same weight, no modal */
  balanced = 'balanced',
  /** Push toward merge - "Merge" is primary, extra confirmation modal */
  restrict = 'restrict',
}

export const SuggestionModeSchema = enum_(SuggestionMode);

// ============================================
// Display Mode Enum
// Controls how participants see and evaluate suggestions
// ============================================
export enum DisplayMode {
  /** Tinder-style single card swipe interface (default) */
  swipe = 'swipe',
  /** Classic multi-card interface with batch loading */
  classic = 'classic',
}

export const DisplayModeSchema = enum_(DisplayMode);

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
  /** Controls UX friction when adding new suggestions vs merging with existing */
  suggestionMode: optional(SuggestionModeSchema),
  /** Display mode: swipe for tinder-style, classic for multi-card */
  displayMode: optional(DisplayModeSchema),
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
  /** Override suggestion mode for THIS question */
  suggestionMode: optional(SuggestionModeSchema),
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
  /** Question type: text, textarea, radio, checkbox, range, number */
  type: UserQuestionTypeSchema,
  /** Options for radio/checkbox types */
  options: optional(array(DemographicOptionSchema)),
  /** Display order within the page */
  order: number(),
  /** Whether this question is required */
  required: boolean(),
  /** Minimum value for range/number types */
  min: optional(number()),
  /** Maximum value for range/number types */
  max: optional(number()),
  /** Step value for range/number types */
  step: optional(number()),
  /** Label for minimum value (e.g., "Do not want") - range type only */
  minLabel: optional(string()),
  /** Label for maximum value (e.g., "Wants very much") - range type only */
  maxLabel: optional(string()),
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
// Survey Explanation Page Schema
// ============================================
export const SurveyExplanationPageSchema = object({
  /** Unique ID for this explanation page */
  explanationPageId: string(),
  /** Title shown to users (e.g., "Before You Begin", "Important Context") */
  title: string(),
  /** Markdown content with support for rich text and images */
  content: string(),
  /** Position in the survey flow: 0 = before questions, 1-n = after question n, -1 = after all */
  position: number(),
  /** Optional hero/header image URL */
  heroImageUrl: optional(string()),
});

export type SurveyExplanationPage = InferOutput<typeof SurveyExplanationPageSchema>;

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
  /** Whether this answer was submitted during test mode */
  isTestData: optional(boolean()),
  /** Timestamp when this data was retroactively marked as test data (if applicable) */
  markedAsTestAt: optional(number()),
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
  /** Explanation page configurations */
  explanationPages: optional(array(SurveyExplanationPageSchema)),
  /** Parent statement ID for inheriting demographic questions */
  parentStatementId: optional(string()),
  /** Custom introduction text to show on welcome screen (replaces default translation) */
  customIntroText: optional(string()),
  /** Whether to show the introduction text on welcome screen (defaults to true) */
  showIntro: optional(boolean()),
  /** Whether the survey is currently in test mode - responses collected in test mode are flagged */
  isTestMode: optional(boolean()),
  /** Array of logos to display on opening slide */
  logos: optional(array(SurveyLogoSchema)),
  /** Markdown content for opening slide (headings, lists, links, images) */
  openingSlideContent: optional(string()),
  /** Whether to show custom opening slide (false = skip to questions directly) */
  showOpeningSlide: optional(boolean()),
  /** Whether to show email signup on completion screen (defaults to true) */
  showEmailSignup: optional(boolean()),
  /** Custom email signup title (replaces default i18n 'stayUpdated') */
  customEmailTitle: optional(string()),
  /** Custom email signup description (replaces default i18n 'emailSignupDescription') */
  customEmailDescription: optional(string()),
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
  /** Whether this progress was created during test mode */
  isTestData: optional(boolean()),
  /** Timestamp when this data was retroactively marked as test data (if applicable) */
  markedAsTestAt: optional(number()),
  /** Whether user has viewed the opening slide (to avoid showing it again) */
  hasViewedOpeningSlide: optional(boolean()),
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
  allowParticipantsToAddSuggestions: true,
  suggestionMode: SuggestionMode.encourage,
  displayMode: DisplayMode.swipe,
};

export const DEFAULT_QUESTION_OVERRIDE_SETTINGS: QuestionOverrideSettings = {
  allowParticipantsToAddSuggestions: undefined,
  askUserForASolutionBeforeEvaluation: undefined,
  allowSkipping: undefined,
  minEvaluationsPerQuestion: undefined,
  randomizeOptions: undefined,
  suggestionMode: undefined,
};
