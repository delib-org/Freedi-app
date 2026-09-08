/**
 * Tests for settingsUtils utility functions
 */
import { SurveySettings, QuestionOverrideSettings, SuggestionMode } from '@freedi/shared-types';
import {
  getMergedSettings,
  isSurveyLevelOverride,
} from '../settingsUtils';

describe('settingsUtils', () => {
  // Helper to create survey settings with defaults
  const createSurveySettings = (overrides: Partial<SurveySettings> = {}): SurveySettings => ({
    allowSkipping: false,
    allowReturning: true,
    minEvaluationsPerQuestion: 3,
    showQuestionPreview: true,
    randomizeQuestions: false,
    allowParticipantsToAddSuggestions: false,
    ...overrides,
  });

  describe('getMergedSettings', () => {
    describe('allowParticipantsToAddSuggestions', () => {
      it('should be false when both survey and question settings are false/undefined', () => {
        const surveySettings = createSurveySettings({ allowParticipantsToAddSuggestions: false });
        const result = getMergedSettings(surveySettings, undefined);
        expect(result.allowParticipantsToAddSuggestions).toBe(false);
      });

      it('should be true when survey setting is true (overrides per-question)', () => {
        const surveySettings = createSurveySettings({ allowParticipantsToAddSuggestions: true });
        const questionOverrides: QuestionOverrideSettings = {
          allowParticipantsToAddSuggestions: false,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.allowParticipantsToAddSuggestions).toBe(true);
      });

      it('should be true when survey is false but question override is true', () => {
        const surveySettings = createSurveySettings({ allowParticipantsToAddSuggestions: false });
        const questionOverrides: QuestionOverrideSettings = {
          allowParticipantsToAddSuggestions: true,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.allowParticipantsToAddSuggestions).toBe(true);
      });

      it('should be true when survey is undefined but question override is true', () => {
        const surveySettings = createSurveySettings({ allowParticipantsToAddSuggestions: undefined });
        const questionOverrides: QuestionOverrideSettings = {
          allowParticipantsToAddSuggestions: true,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.allowParticipantsToAddSuggestions).toBe(true);
      });
    });

    describe('askUserForASolutionBeforeEvaluation', () => {
      it('should be true when question override is undefined (default behavior)', () => {
        const surveySettings = createSurveySettings();
        const result = getMergedSettings(surveySettings, undefined);
        expect(result.askUserForASolutionBeforeEvaluation).toBe(true);
      });

      it('should be true when question override is true', () => {
        const surveySettings = createSurveySettings();
        const questionOverrides: QuestionOverrideSettings = {
          askUserForASolutionBeforeEvaluation: true,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.askUserForASolutionBeforeEvaluation).toBe(true);
      });

      it('should be false when question override is false', () => {
        const surveySettings = createSurveySettings();
        const questionOverrides: QuestionOverrideSettings = {
          askUserForASolutionBeforeEvaluation: false,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.askUserForASolutionBeforeEvaluation).toBe(false);
      });
    });

    describe('allowSkipping', () => {
      it('should be false when both survey and question settings are false', () => {
        const surveySettings = createSurveySettings({ allowSkipping: false });
        const result = getMergedSettings(surveySettings, undefined);
        expect(result.allowSkipping).toBe(false);
      });

      it('should be true when survey setting is true (overrides per-question)', () => {
        const surveySettings = createSurveySettings({ allowSkipping: true });
        const questionOverrides: QuestionOverrideSettings = {
          allowSkipping: false,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.allowSkipping).toBe(true);
      });

      it('should be true when survey is false but question override is true', () => {
        const surveySettings = createSurveySettings({ allowSkipping: false });
        const questionOverrides: QuestionOverrideSettings = {
          allowSkipping: true,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.allowSkipping).toBe(true);
      });
    });

    describe('minEvaluationsPerQuestion', () => {
      it('should use survey default when question override is undefined', () => {
        const surveySettings = createSurveySettings({ minEvaluationsPerQuestion: 5 });
        const result = getMergedSettings(surveySettings, undefined);
        expect(result.minEvaluationsPerQuestion).toBe(5);
      });

      it('should use question override when set', () => {
        const surveySettings = createSurveySettings({ minEvaluationsPerQuestion: 5 });
        const questionOverrides: QuestionOverrideSettings = {
          minEvaluationsPerQuestion: 10,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.minEvaluationsPerQuestion).toBe(10);
      });

      it('should use question override of 0 when explicitly set', () => {
        const surveySettings = createSurveySettings({ minEvaluationsPerQuestion: 5 });
        const questionOverrides: QuestionOverrideSettings = {
          minEvaluationsPerQuestion: 0,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.minEvaluationsPerQuestion).toBe(0);
      });
    });

    describe('randomizeOptions', () => {
      it('should be false when question override is undefined', () => {
        const surveySettings = createSurveySettings();
        const result = getMergedSettings(surveySettings, undefined);
        expect(result.randomizeOptions).toBe(false);
      });

      it('should be true when question override is true', () => {
        const surveySettings = createSurveySettings();
        const questionOverrides: QuestionOverrideSettings = {
          randomizeOptions: true,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.randomizeOptions).toBe(true);
      });

      it('should be false when question override is false', () => {
        const surveySettings = createSurveySettings();
        const questionOverrides: QuestionOverrideSettings = {
          randomizeOptions: false,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);
        expect(result.randomizeOptions).toBe(false);
      });
    });

    describe('complete merged settings', () => {
      it('should return all settings with correct types', () => {
        const surveySettings = createSurveySettings();
        const result = getMergedSettings(surveySettings, undefined);

        expect(typeof result.allowParticipantsToAddSuggestions).toBe('boolean');
        expect(typeof result.askUserForASolutionBeforeEvaluation).toBe('boolean');
        expect(typeof result.allowSkipping).toBe('boolean');
        expect(typeof result.minEvaluationsPerQuestion).toBe('number');
        expect(typeof result.randomizeOptions).toBe('boolean');
      });

      it('should merge all settings correctly', () => {
        const surveySettings = createSurveySettings({
          allowSkipping: true,
          allowParticipantsToAddSuggestions: false,
          minEvaluationsPerQuestion: 3,
        });
        const questionOverrides: QuestionOverrideSettings = {
          askUserForASolutionBeforeEvaluation: true,
          minEvaluationsPerQuestion: 7,
          randomizeOptions: true,
        };
        const result = getMergedSettings(surveySettings, questionOverrides);

        expect(result).toMatchObject({
          allowParticipantsToAddSuggestions: false,
          askUserForASolutionBeforeEvaluation: true,
          allowSkipping: true,
          minEvaluationsPerQuestion: 7,
          randomizeOptions: true,
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty question overrides object', () => {
        const surveySettings = createSurveySettings({ minEvaluationsPerQuestion: 5 });
        const questionOverrides: QuestionOverrideSettings = {};
        const result = getMergedSettings(surveySettings, questionOverrides);

        expect(result.minEvaluationsPerQuestion).toBe(5);
        expect(result.allowParticipantsToAddSuggestions).toBe(false);
      });

      it('should handle undefined question overrides', () => {
        const surveySettings = createSurveySettings();
        const result = getMergedSettings(surveySettings, undefined);

        expect(result).toBeDefined();
        expect(result.allowSkipping).toBe(false);
      });
    });
  });

  describe('isSurveyLevelOverride', () => {
    describe('allowParticipantsToAddSuggestions', () => {
      it('should return true when survey-level setting is true', () => {
        const surveySettings = createSurveySettings({ allowParticipantsToAddSuggestions: true });
        const result = isSurveyLevelOverride(surveySettings, 'allowParticipantsToAddSuggestions');
        expect(result).toBe(true);
      });

      it('should return false when survey-level setting is false', () => {
        const surveySettings = createSurveySettings({ allowParticipantsToAddSuggestions: false });
        const result = isSurveyLevelOverride(surveySettings, 'allowParticipantsToAddSuggestions');
        expect(result).toBe(false);
      });

      it('should return false when survey-level setting is undefined', () => {
        const surveySettings = createSurveySettings({ allowParticipantsToAddSuggestions: undefined });
        const result = isSurveyLevelOverride(surveySettings, 'allowParticipantsToAddSuggestions');
        expect(result).toBe(false);
      });
    });

    describe('allowSkipping', () => {
      it('should return true when survey-level setting is true', () => {
        const surveySettings = createSurveySettings({ allowSkipping: true });
        const result = isSurveyLevelOverride(surveySettings, 'allowSkipping');
        expect(result).toBe(true);
      });

      it('should return false when survey-level setting is false', () => {
        const surveySettings = createSurveySettings({ allowSkipping: false });
        const result = isSurveyLevelOverride(surveySettings, 'allowSkipping');
        expect(result).toBe(false);
      });
    });

    describe('settings without survey-level overrides', () => {
      it('should return false for askUserForASolutionBeforeEvaluation', () => {
        const surveySettings = createSurveySettings();
        const result = isSurveyLevelOverride(surveySettings, 'askUserForASolutionBeforeEvaluation');
        expect(result).toBe(false);
      });

      it('should return false for minEvaluationsPerQuestion', () => {
        const surveySettings = createSurveySettings();
        const result = isSurveyLevelOverride(surveySettings, 'minEvaluationsPerQuestion');
        expect(result).toBe(false);
      });

      it('should return false for randomizeOptions', () => {
        const surveySettings = createSurveySettings();
        const result = isSurveyLevelOverride(surveySettings, 'randomizeOptions');
        expect(result).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for unknown setting keys', () => {
        const surveySettings = createSurveySettings();
        // TypeScript would normally prevent this, but testing runtime behavior
        const result = isSurveyLevelOverride(
          surveySettings,
          'unknownSetting' as keyof QuestionOverrideSettings
        );
        expect(result).toBe(false);
      });
    });
  });

  describe('integration', () => {
    it('should correctly identify when per-question control should be disabled', () => {
      const surveySettings = createSurveySettings({
        allowSkipping: true,
        allowParticipantsToAddSuggestions: false,
      });

      // allowSkipping is true at survey level, so per-question control should be disabled
      expect(isSurveyLevelOverride(surveySettings, 'allowSkipping')).toBe(true);

      // allowParticipantsToAddSuggestions is false, so per-question control should work
      expect(isSurveyLevelOverride(surveySettings, 'allowParticipantsToAddSuggestions')).toBe(false);

      // Verify merged settings respect this
      const questionOverrides: QuestionOverrideSettings = {
        allowSkipping: false, // This should be ignored because survey-level is true
        allowParticipantsToAddSuggestions: true, // This should apply
      };

      const merged = getMergedSettings(surveySettings, questionOverrides);
      expect(merged.allowSkipping).toBe(true); // Survey override wins
      expect(merged.allowParticipantsToAddSuggestions).toBe(true); // Question override applies
    });
  });

  describe('suggestionMode', () => {
    it('falls back to restrict for surveys saved without the setting', () => {
      expect(getMergedSettings(createSurveySettings(), undefined).suggestionMode).toBe(
        SuggestionMode.restrict,
      );
    });

    it('uses the survey default when the question has no override', () => {
      const surveySettings = createSurveySettings({ suggestionMode: SuggestionMode.encourage });
      expect(getMergedSettings(surveySettings, {}).suggestionMode).toBe(SuggestionMode.encourage);
    });

    it('lets the question override the survey default', () => {
      const surveySettings = createSurveySettings({ suggestionMode: SuggestionMode.encourage });
      const merged = getMergedSettings(surveySettings, { suggestionMode: SuggestionMode.balanced });
      expect(merged.suggestionMode).toBe(SuggestionMode.balanced);
    });
  });

  describe('automatic AI handling (autoSplitMultiSuggestions / autoMergeSimilar)', () => {
    it('defaults both to off so existing surveys keep asking the participant', () => {
      const merged = getMergedSettings(createSurveySettings(), undefined);
      expect(merged.autoSplitMultiSuggestions).toBe(false);
      expect(merged.autoMergeSimilar).toBe(false);
    });

    it('uses the survey default when the question has no override', () => {
      const surveySettings = createSurveySettings({
        autoSplitMultiSuggestions: true,
        autoMergeSimilar: true,
      });
      const merged = getMergedSettings(surveySettings, {});
      expect(merged.autoSplitMultiSuggestions).toBe(true);
      expect(merged.autoMergeSimilar).toBe(true);
    });

    it('lets a question turn a feature on when the survey has it off', () => {
      const merged = getMergedSettings(createSurveySettings(), {
        autoSplitMultiSuggestions: true,
        autoMergeSimilar: true,
      });
      expect(merged.autoSplitMultiSuggestions).toBe(true);
      expect(merged.autoMergeSimilar).toBe(true);
    });

    it('lets a question turn a feature off when the survey has it on', () => {
      const surveySettings = createSurveySettings({
        autoSplitMultiSuggestions: true,
        autoMergeSimilar: true,
      });
      const merged = getMergedSettings(surveySettings, {
        autoSplitMultiSuggestions: false,
        autoMergeSimilar: false,
      });
      expect(merged.autoSplitMultiSuggestions).toBe(false);
      expect(merged.autoMergeSimilar).toBe(false);
    });

    it('resolves the two features independently', () => {
      const surveySettings = createSurveySettings({ autoMergeSimilar: true });
      const merged = getMergedSettings(surveySettings, { autoSplitMultiSuggestions: true });
      expect(merged.autoSplitMultiSuggestions).toBe(true);
      expect(merged.autoMergeSimilar).toBe(true);
    });

    it('is never forced by the survey level (per-question control stays enabled)', () => {
      const surveySettings = createSurveySettings({
        autoSplitMultiSuggestions: true,
        autoMergeSimilar: true,
      });
      expect(isSurveyLevelOverride(surveySettings, 'autoSplitMultiSuggestions')).toBe(false);
      expect(isSurveyLevelOverride(surveySettings, 'autoMergeSimilar')).toBe(false);
    });
  });
});
