'use client';

/**
 * QuestionSettingsPanel — the per-question overrides inside an expanded
 * question row of the survey editor. Everything to do with participants
 * adding their own answers is locked while the question is set to
 * "Participants can't add options" (see QuestionOptionsBlock).
 */

import { useTranslation } from '@freedi/shared-i18n/next';
import type {
  Statement,
  SurveySettings,
  QuestionOverrideSettings,
  RatingMode,
  EvaluationScaleKey,
} from '@freedi/shared-types';
import {
  SuggestionMode,
  resolveEvaluationScaleKey,
  THREE_POINT_STEPS,
  FIVE_POINT_STEPS,
} from '@freedi/shared-types';
import {
  areSuggestionsClosed,
  resolveAllowSuggestions,
  withAllowSuggestions,
} from '@/lib/utils/settingsUtils';
import styles from '../Admin.module.scss';
import { readLiveSynthFromSettings } from '../liveSynthSettings';

export interface QuestionSettingsPanelProps {
  questionSetting?: QuestionOverrideSettings;
  /** The question Statement's own settings — what participants get until this survey overrides it. */
  storedSettings?: Statement['statementSettings'];
  surveySettings: SurveySettings;
  onChange: (settings: QuestionOverrideSettings) => void;
}

export default function QuestionSettingsPanel({
  questionSetting,
  storedSettings,
  surveySettings,
  onChange,
}: QuestionSettingsPanelProps) {
  const { t } = useTranslation();

  const handleToggle = (key: keyof QuestionOverrideSettings, value: boolean) => {
    onChange({ ...questionSetting, [key]: value });
  };

  const handleNumber = (key: keyof QuestionOverrideSettings, value: number | undefined) => {
    onChange({ ...questionSetting, [key]: value });
  };

  const handleSuggestionMode = (value: string) => {
    if (value === 'default') {
      // Remove the override by creating new object without suggestionMode
      const newSetting = { ...questionSetting };
      delete newSetting.suggestionMode;
      onChange(newSetting);
    } else {
      onChange({ ...questionSetting, suggestionMode: value as SuggestionMode });
    }
  };

  // One dropdown, two stored fields: `ratingMode` picks the face set and
  // `ratingSteps` the length of the agree-disagree scale. Every choice is
  // written explicitly — the survey save only cascades an explicit override
  // onto the question, so "back to the default" has to be one too.
  // "Participants can't add options" (the Options block above) locks every
  // setting about participants' own answers; the two "ask for a suggestion"
  // toggles also mean nothing while suggestions are simply turned off.
  const blocked = questionSetting?.blockParticipantOptions === true;
  const suggestionsAllowed = !blocked && !areSuggestionsClosed(surveySettings, questionSetting);
  const lockedHint = blocked
    ? t("Not used — participants can't add options to this question")
    : t('suggestionsOffForQuestion') || 'Off because suggestions are turned off for this question.';

  // With no override yet, show the scale the question already carries (it may
  // have been set from another app) rather than claiming the default.
  const ratingScale = resolveEvaluationScaleKey(
    questionSetting?.ratingMode ? questionSetting : storedSettings
  );

  const handleRatingScale = (value: string) => {
    const scale = value as EvaluationScaleKey;
    const ratingMode: RatingMode = scale === 'reactions' ? 'reactions' : 'agree-disagree';
    const ratingSteps = scale === 'three-point' ? THREE_POINT_STEPS : FIVE_POINT_STEPS;

    onChange({ ...questionSetting, ratingMode, ratingSteps });
  };

  // Get the survey default label for the dropdown
  const getSurveyDefaultLabel = () => {
    // Must match the fallback in getMergedSettings (restrict for surveys without the key)
    const defaultMode = surveySettings.suggestionMode || SuggestionMode.restrict;
    const labels: Record<string, string> = {
      [SuggestionMode.encourage]: t('suggestionModeEncourage') || 'Encourage New Ideas',
      [SuggestionMode.balanced]: t('suggestionModeBalanced') || 'Balanced',
      [SuggestionMode.restrict]: t('suggestionModeRestrict') || 'Encourage Merging',
    };
    return labels[defaultMode] || defaultMode;
  };

  return (
    <div className={styles.questionSettingsPanel}>
      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={!blocked && resolveAllowSuggestions(surveySettings, questionSetting)}
              disabled={blocked}
              onChange={(e) =>
                onChange(withAllowSuggestions(surveySettings, questionSetting, e.target.checked))
              }
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('allowParticipantsToAddSuggestionsQuestion') || 'Allow participants to add suggestions'}</span>
        </div>
        {blocked && <span className={styles.settingHint}>{lockedHint}</span>}
      </div>

      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={suggestionsAllowed && (questionSetting?.askUserForASolutionBeforeEvaluation ?? true)}
              disabled={!suggestionsAllowed}
              onChange={(e) => handleToggle('askUserForASolutionBeforeEvaluation', e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('askForSuggestionBeforeEvaluation') || 'Ask for suggestion before showing options'}</span>
        </div>
        {!suggestionsAllowed && <span className={styles.settingHint}>{lockedHint}</span>}
      </div>

      {/* Suggestion Mode override */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <span>{t('suggestionModeOverride') || 'Suggestion Mode'}</span>
        </label>
        <select
          className={styles.selectInput}
          value={questionSetting?.suggestionMode || 'default'}
          disabled={blocked}
          onChange={(e) => handleSuggestionMode(e.target.value)}
          style={{ marginTop: '0.25rem' }}
        >
          <option value="default">
            {t('useSurveyDefault') || 'Use Survey Default'} ({getSurveyDefaultLabel()})
          </option>
          <option value={SuggestionMode.encourage}>
            {t('suggestionModeEncourage') || 'Encourage New Ideas'}
          </option>
          <option value={SuggestionMode.balanced}>
            {t('suggestionModeBalanced') || 'Balanced'}
          </option>
          <option value={SuggestionMode.restrict}>
            {t('suggestionModeRestrict') || 'Encourage Merging'}
          </option>
        </select>
        <span className={styles.settingHint}>
          {blocked ? lockedHint : t('suggestionModeHint') || 'Controls how easy it is to add new vs. merge with existing'}
        </span>
      </div>

      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={questionSetting?.allowSkipping ?? false}
              disabled={surveySettings.allowSkipping}
              onChange={(e) => handleToggle('allowSkipping', e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('allowSkippingThisQuestion') || 'Allow skipping this question'}</span>
        </div>
      </div>

      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <span>{t('minEvaluationsThisQuestion') || 'Minimum evaluations for this question'}</span>
          <input
            type="number"
            className={styles.numberInput}
            value={questionSetting?.minEvaluationsPerQuestion ?? ''}
            placeholder={String(surveySettings.minEvaluationsPerQuestion)}
            min={0}
            max={100}
            onChange={(e) => {
              const val = e.target.value;
              handleNumber('minEvaluationsPerQuestion', val ? parseInt(val, 10) : undefined);
            }}
          />
        </label>
      </div>

      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <span>{t('minWordsThisQuestion') || 'Minimum words per response'}</span>
          <input
            type="number"
            className={styles.numberInput}
            value={questionSetting?.minResponseWords ?? ''}
            placeholder="0"
            min={0}
            max={100}
            disabled={blocked}
            onChange={(e) => {
              const val = e.target.value;
              handleNumber('minResponseWords', val ? parseInt(val, 10) : undefined);
            }}
          />
        </label>
        <span className={styles.settingHint}>
          {blocked ? lockedHint : t('minWordsHint') || 'Require each response to have at least this many words. 0 = no minimum.'}
        </span>
      </div>

      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <span>{t('ratingModeThisQuestion') || 'How participants rate options'}</span>
          <select
            className={styles.selectInput}
            value={ratingScale}
            onChange={(e) => handleRatingScale(e.target.value)}
          >
            <option value="agree-disagree">
              {t('ratingModeAgreeDisagree') || 'Agree – Disagree, 5 steps (default)'}
            </option>
            <option value="three-point">
              {t('ratingModeThreePoint') || 'Disagree – Neutral – Agree, 3 steps (−1, 0, +1)'}
            </option>
            <option value="reactions">
              {t('ratingModeReactions') || 'Emoji reactions 😐🙂😊👍❤️'}
            </option>
          </select>
        </label>
        <span className={styles.settingHint}>
          {t('ratingModeHint') ||
            'Reactions use a positive-only scale (no disagree) and apply across all apps. The 3-step scale applies in Mass Consensus; other apps keep showing 5 steps.'}
        </span>
      </div>

      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={questionSetting?.showViewProgress ?? true}
              onChange={(e) => handleToggle('showViewProgress', e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('showViewProgress') || 'Show view progress / status button'}</span>
        </div>
      </div>

      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={suggestionsAllowed && (questionSetting?.askUserForASolutionAfterEvaluation ?? false)}
              disabled={!suggestionsAllowed}
              onChange={(e) => handleToggle('askUserForASolutionAfterEvaluation', e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('askForSuggestionAfterEvaluation') || 'Ask user to add an answer after completing evaluations'}</span>
        </div>
        {!suggestionsAllowed && <span className={styles.settingHint}>{lockedHint}</span>}
      </div>

      {/* Automatic AI handling of submissions. Each toggle shows the survey
          default until the admin overrides it for this question. */}
      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={!blocked && (questionSetting?.autoSplitMultiSuggestions ?? surveySettings.autoSplitMultiSuggestions ?? false)}
              disabled={blocked}
              onChange={(e) => handleToggle('autoSplitMultiSuggestions', e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('autoSplitMultiSuggestions') || 'Split multi-answer submissions automatically'}</span>
        </div>
        <span className={styles.settingHint}>
          {blocked ? lockedHint : t('autoSplitMultiSuggestionsHint') || 'When one submission holds several answers, add each as its own suggestion without asking the participant.'}
        </span>
      </div>

      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={!blocked && (questionSetting?.autoMergeSimilar ?? surveySettings.autoMergeSimilar ?? false)}
              disabled={blocked}
              onChange={(e) => handleToggle('autoMergeSimilar', e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('autoMergeSimilar') || 'Merge similar suggestions automatically'}</span>
        </div>
        <span className={styles.settingHint}>
          {blocked ? lockedHint : t('autoMergeSimilarHint') || 'When a similar suggestion already exists, merge into it without asking and count the participant as agreeing (+1) with the merged suggestion.'}
        </span>
      </div>

      {/* Live synthesis per-question override.
          When the survey-level toggle is off, this checkbox is disabled and
          forced to OFF — the survey kill switch wins. */}
      <div className={styles.settingRow}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={(() => {
                const surveyOn = readLiveSynthFromSettings(surveySettings) ?? true;
                if (!surveyOn) return false;
                const override = readLiveSynthFromSettings(questionSetting);
                return override ?? true;
              })()}
              disabled={readLiveSynthFromSettings(surveySettings) === false}
              onChange={(e) => {
                onChange({
                  ...(questionSetting || {}),
                  liveSynthEnabled: e.target.checked,
                } as QuestionOverrideSettings);
              }}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('liveSynthEnabledForQuestion') || 'Auto-synthesis enabled for this question'}</span>
        </div>
        {readLiveSynthFromSettings(surveySettings) === false && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
            {t('synthesisDisabledTooltip') || 'Enable synthesis at the survey level to use this'}
          </span>
        )}
      </div>
    </div>
  );
}
