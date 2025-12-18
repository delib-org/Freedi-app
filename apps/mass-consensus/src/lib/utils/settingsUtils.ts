import { SurveySettings, QuestionOverrideSettings } from '@/types/survey';

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
}

/**
 * Merges survey-level settings with per-question overrides.
 *
 * Priority rules:
 * - Survey-level `allowParticipantsToAddSuggestions` when true: applies to ALL questions
 * - Survey-level `allowSkipping` when true: applies to ALL questions
 * - Per-question `minEvaluationsPerQuestion`: overrides survey default if set
 * - Per-question settings only take effect when survey-level is false/undefined
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
    // Survey-level allowParticipantsToAddSuggestions overrides per-question when enabled
    allowParticipantsToAddSuggestions:
      surveySettings.allowParticipantsToAddSuggestions === true ||
      (questionOverrides?.allowParticipantsToAddSuggestions ?? false),

    // Per-question askUserForASolutionBeforeEvaluation (no survey-level equivalent)
    askUserForASolutionBeforeEvaluation:
      questionOverrides?.askUserForASolutionBeforeEvaluation ?? false,

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
    case 'allowParticipantsToAddSuggestions':
      return surveySettings.allowParticipantsToAddSuggestions === true;
    case 'allowSkipping':
      return surveySettings.allowSkipping === true;
    // These settings don't have survey-level overrides
    case 'askUserForASolutionBeforeEvaluation':
    case 'minEvaluationsPerQuestion':
    case 'randomizeOptions':
      return false;
    default:
      return false;
  }
}
