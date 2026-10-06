import { SurveySettings, QuestionOverrideSettings, SuggestionMode, DisplayMode } from '@/types/survey';
import { clampCardColorIntensity } from './cardColorIntensity';

/**
 * Merged settings that apply to a specific question
 * Combines survey-level defaults with per-question overrides
 */
export interface MergedQuestionSettings {
  allowParticipantsToAddSuggestions: boolean;
  askUserForASolutionBeforeEvaluation: boolean;
  allowSkipping: boolean;
  minEvaluationsPerQuestion: number;
  randomizeOptions: boolean;
  /** Controls UX friction when adding new suggestions vs merging */
  suggestionMode: SuggestionMode;
  /** Display mode: swipe for tinder-style, classic for multi-card */
  displayMode: DisplayMode;
  /** Show view progress / status button for this question */
  showViewProgress: boolean;
  /** Ask user for a solution after completing minimum evaluations */
  askUserForASolutionAfterEvaluation: boolean;
  /** Split a multi-answer submission automatically instead of asking the participant */
  autoSplitMultiSuggestions: boolean;
  /** Merge into a similar existing suggestion automatically and +1 it for the author */
  autoMergeSimilar: boolean;
  /** How strongly evaluation cards are tinted, 0 (white) to 1 (full colour) */
  cardColorIntensity: number;
}

/**
 * May participants add suggestions on this question? The question's own choice
 * when it made one, otherwise the survey-wide default — so the survey switch
 * turns every question on or off at once, and any single question can still
 * go the other way.
 */
export function resolveAllowSuggestions(
  surveySettings: SurveySettings,
  questionOverrides: QuestionOverrideSettings | undefined
): boolean {
  return (
    questionOverrides?.allowParticipantsToAddSuggestions ??
    surveySettings.allowParticipantsToAddSuggestions === true
  );
}

/**
 * The per-question settings after the admin flips "allow suggestions" for one
 * question. A choice equal to the survey default is not stored, so that
 * question keeps following the default if the survey switch changes later.
 */
export function withAllowSuggestions(
  surveySettings: SurveySettings,
  questionOverrides: QuestionOverrideSettings | undefined,
  allow: boolean
): QuestionOverrideSettings {
  const next: QuestionOverrideSettings = { ...questionOverrides };
  if (allow === (surveySettings.allowParticipantsToAddSuggestions === true)) {
    delete next.allowParticipantsToAddSuggestions;
  } else {
    next.allowParticipantsToAddSuggestions = allow;
  }

  return next;
}

/**
 * Merges survey-level settings with per-question overrides.
 *
 * Priority rules:
 * - `allowParticipantsToAddSuggestions`: the survey sets the default, a question may override it either way
 * - Survey-level `allowSkipping` when true: applies to ALL questions
 * - Per-question `minEvaluationsPerQuestion`: overrides survey default if set
 *
 * @param surveySettings - The survey-level settings
 * @param questionOverrides - The per-question override settings (optional)
 * @returns Merged settings for the specific question
 */
export function getMergedSettings(
  surveySettings: SurveySettings,
  questionOverrides: QuestionOverrideSettings | undefined
): MergedQuestionSettings {
  return {
    // Survey-level allowParticipantsToAddSuggestions is the default; a question can override it
    allowParticipantsToAddSuggestions: resolveAllowSuggestions(surveySettings, questionOverrides),

    // Per-question askUserForASolutionBeforeEvaluation (no survey-level equivalent)
    // Default to true: users should provide their own suggestion before seeing others
    askUserForASolutionBeforeEvaluation:
      questionOverrides?.askUserForASolutionBeforeEvaluation ?? true,

    // Survey-level allowSkipping overrides per-question when enabled
    allowSkipping:
      surveySettings.allowSkipping === true ||
      (questionOverrides?.allowSkipping ?? false),

    // Use per-question minEvaluations if set, otherwise survey default
    minEvaluationsPerQuestion:
      questionOverrides?.minEvaluationsPerQuestion ??
      surveySettings.minEvaluationsPerQuestion,

    // Per-question randomize options (survey-level randomizeQuestions is for question ORDER)
    randomizeOptions: questionOverrides?.randomizeOptions ?? false,

    // Suggestion mode: per-question override takes precedence, otherwise survey default
    // Falls back to 'encourage' for existing surveys without the setting
    suggestionMode:
      questionOverrides?.suggestionMode ??
      surveySettings.suggestionMode ??
      SuggestionMode.restrict, // Backward compatible: existing surveys use restrict (current behavior)

    // Display mode (survey-level only, no per-question override)
    displayMode: surveySettings.displayMode ?? DisplayMode.swipe,

    // Show view progress / status button (per-question, defaults to true for backward compatibility)
    showViewProgress: questionOverrides?.showViewProgress ?? true,

    // Ask user for a solution after completing minimum evaluations (defaults to false)
    askUserForASolutionAfterEvaluation: questionOverrides?.askUserForASolutionAfterEvaluation ?? false,

    // Automatic AI handling of submissions: per-question override, then survey
    // default, then off (existing surveys keep asking the participant)
    autoSplitMultiSuggestions:
      questionOverrides?.autoSplitMultiSuggestions ??
      surveySettings.autoSplitMultiSuggestions ??
      false,
    autoMergeSimilar:
      questionOverrides?.autoMergeSimilar ??
      surveySettings.autoMergeSimilar ??
      false,

    // Card tint (survey-level only, no per-question override)
    cardColorIntensity: clampCardColorIntensity(surveySettings.cardColorIntensity),
  };
}

/**
 * Check if a specific setting is overridden at the survey level
 * Used to disable per-question controls in the admin UI
 *
 * @param surveySettings - The survey-level settings
 * @param settingKey - The setting to check
 * @returns true if the setting is forced by survey-level configuration
 */
export function isSurveyLevelOverride(
  surveySettings: SurveySettings,
  settingKey: keyof QuestionOverrideSettings
): boolean {
  switch (settingKey) {
    case 'allowSkipping':
      return surveySettings.allowSkipping === true;
    // These settings don't have survey-level overrides (per-question can always override)
    case 'allowParticipantsToAddSuggestions':
    case 'askUserForASolutionBeforeEvaluation':
    case 'minEvaluationsPerQuestion':
    case 'randomizeOptions':
    case 'suggestionMode':
    case 'showViewProgress':
    case 'askUserForASolutionAfterEvaluation':
    case 'autoSplitMultiSuggestions':
    case 'autoMergeSimilar':
      return false;
    default:
      return false;
  }
}
