import React, { FC, useState } from 'react';
import { ExplanationConfig } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useExplanations } from '@/contexts/massConsensus/ExplanationProvider';
import { useNavigate } from 'react-router';
import styles from './StageExplanationScreen.module.scss';
import InfoIcon from '@/assets/icons/infoIcon.svg?react';

interface StageExplanationScreenProps {
  stageId: string;
  explanation?: ExplanationConfig;
  onContinue: () => void;
  onBack?: () => void;
  nextStageUrl?: string;
  previousStageUrl?: string;
}

export const StageExplanationScreen: FC<StageExplanationScreenProps> = ({
  stageId,
  explanation: explicitExplanation,
  onContinue,
  onBack,
  nextStageUrl,
  previousStageUrl
}) => {
  const { t, dir } = useUserConfig();
  const navigate = useNavigate();
  const {
    getStageExplanation,
    markExplanationSeen,
    setDontShowExplanations,
    getDontShowExplanations
  } = useExplanations();

  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Get explanation from context or use explicit one
  const explanation = explicitExplanation || getStageExplanation(stageId);

  // If no explanation or disabled, continue directly
  if (!explanation?.enabled || getDontShowExplanations()) {
    onContinue();
    return null;
  }

  const handleContinue = () => {
    // Mark as seen
    markExplanationSeen(stageId);

    // Save don't show preference if checked
    if (dontShowAgain) {
      setDontShowExplanations(true);
    }

    onContinue();
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (previousStageUrl) {
      navigate(previousStageUrl);
    }
  };

  const getIconForStage = () => {
    switch (stageId) {
      case 'randomSuggestions':
        return '🎲';
      case 'topSuggestions':
        return '⭐';
      case 'voting':
        return '🗳️';
      case 'question':
        return '💡';
      case 'introduction':
        return '👋';
      default:
        return '📋';
    }
  };

  return (
    <div className={styles.explanationScreen} style={{ direction: dir }}>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.iconWrapper}>
            <span className={styles.icon}>{getIconForStage()}</span>
          </div>

          {explanation.title && (
            <h1 className={styles.title}>{t(explanation.title)}</h1>
          )}

          <div className={styles.description}>
            <p>{t(explanation.content)}</p>
          </div>

          {/* Additional info sections if needed */}
          <div className={styles.infoSections}>
            {stageId === 'randomSuggestions' && (
              <div className={styles.infoBox}>
                <h3>{t('Why Random?')}</h3>
                <ul>
                  <li>{t('Ensures fair representation of all ideas')}</li>
                  <li>{t('Prevents popularity bias')}</li>
                  <li>{t('Gives every suggestion equal chance')}</li>
                </ul>
              </div>
            )}

            {stageId === 'topSuggestions' && (
              <div className={styles.infoBox}>
                <h3>{t('What are Top Suggestions?')}</h3>
                <ul>
                  <li>{t('Highest rated by the community')}</li>
                  <li>{t('Based on collective evaluation')}</li>
                  <li>{t('Refined through peer review')}</li>
                </ul>
              </div>
            )}

            {stageId === 'voting' && (
              <div className={styles.infoBox}>
                <h3>{t('Your Vote Matters')}</h3>
                <ul>
                  <li>{t('This is the final decision stage')}</li>
                  <li>{t('Each vote has equal weight')}</li>
                  <li>{t('The result represents collective wisdom')}</li>
                </ul>
              </div>
            )}
          </div>

          {/* Don't show again checkbox */}
          <div className={styles.dontShowWrapper}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              <span>{t("Don't show explanations again")}</span>
            </label>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className={styles.navigation}>
          {(onBack || previousStageUrl) && (
            <button
              className="btn btn--secondary"
              onClick={handleBack}
            >
              ← {t('Previous')}
            </button>
          )}

          <button
            className="btn btn--primary btn--large"
            onClick={handleContinue}
          >
            {t('Continue')} →
          </button>
        </div>
      </div>
    </div>
  );
};

export default StageExplanationScreen;