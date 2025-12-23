'use client';

import { useEffect, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { VALIDATION, UI } from '@/constants/common';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './SimilarSolutions.module.scss';

interface SimilarSolutionsProps {
  userSuggestion: string;
  similarSolutions: Statement[];
  /** Called when user selects how to proceed:
   * - null = create new separate proposal
   * - statementId = merge into existing (new default behavior)
   */
  onSelect: (statementId: string | null) => void;
  /** Called when user wants to merge into a specific statement */
  onMerge?: (targetStatementId: string) => void;
  onBack: () => void;
  /** If true, enables auto-merge behavior (default: true) */
  enableAutoMerge?: boolean;
}

export default function SimilarSolutions({
  userSuggestion,
  similarSolutions,
  onSelect,
  onMerge,
  onBack,
  enableAutoMerge: _enableAutoMerge = true,
}: SimilarSolutionsProps) {
  const { t } = useTranslation();
  const [showKeepSeparateModal, setShowKeepSeparateModal] = useState(false);

  // Show max 3 similar solutions
  const topSimilar = similarSolutions.slice(
    0,
    VALIDATION.MAX_SIMILAR_SOLUTIONS_DISPLAY
  );

  // Auto-select if only user's suggestion (no similar found)
  // Move setTimeout to useEffect to avoid setState during render
  useEffect(() => {
    if (topSimilar.length === 0) {
      const timer = setTimeout(() => onSelect(null), UI.FORM_RESET_DELAY);

      return () => clearTimeout(timer);
    }
  }, [topSimilar.length, onSelect]);

  // Don't render if no similar solutions
  if (topSimilar.length === 0) {
    return null;
  }

  // Handler for merge action (new default behavior)
  const handleMerge = (statementId: string) => {
    if (onMerge) {
      onMerge(statementId);
    } else {
      // Fallback: use onSelect for backward compatibility
      onSelect(statementId);
    }
  };

  // Handler for "keep separate" click - shows confirmation modal
  const handleKeepSeparateClick = () => {
    setShowKeepSeparateModal(true);
  };

  // Handler for confirming keep separate
  const handleConfirmKeepSeparate = () => {
    setShowKeepSeparateModal(false);
    onSelect(null);
  };

  // Get the best similar solution (first one)
  const bestSimilar = topSimilar[0];

  return (
    <div className={styles.container}>
      {/* Keep Separate Confirmation Modal */}
      {showKeepSeparateModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}>💡</span>
              <h3>{t('Why merge?')}</h3>
            </div>
            <div className={styles.modalContent}>
              <ul className={styles.benefitsList}>
                <li>{t('Your voice is preserved in the merged proposal')}</li>
                <li>{t('Stronger together = more impact')}</li>
                <li>{t('Avoids vote splitting between similar ideas')}</li>
              </ul>
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowKeepSeparateModal(false)}
                className={styles.mergeAnywayButton}
              >
                {t('Merge Anyway')}
              </button>
              <button
                onClick={handleConfirmKeepSeparate}
                className={styles.keepSeparateConfirmButton}
              >
                {t('Keep Separate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header - Updated messaging for merge-first approach */}
      <div className={styles.header}>
        <h2>{t('Similar proposal found!')} 👥</h2>
        <p>{t('Your idea will be merged to strengthen this proposal')}</p>
      </div>

      {/* Primary: Best Similar Solution for Merge */}
      <div className={styles.section}>
        <div className={styles.mergeTargetCard}>
          {/* Metadata */}
          <div className={styles.similarMeta}>
            <span className={styles.similarityScore}>
              {Math.round(((bestSimilar as Statement & { similarity?: number }).similarity ?? 0.85) * 100)}% {t('similar')}
            </span>
            <span className={styles.supportCount}>
              👥 {bestSimilar.evaluation?.numberOfEvaluators || 0} {bestSimilar.evaluation?.numberOfEvaluators === 1 ? t('supporter') : t('supporters')}
            </span>
          </div>

          {/* Solution Text */}
          <div className={styles.solutionText}>{bestSimilar.statement}</div>

          {/* Your addition preview */}
          <div className={styles.yourAddition}>
            <span className={styles.yourAdditionLabel}>{t('Your addition:')}</span>
            <p className={styles.yourAdditionText}>{userSuggestion}</p>
          </div>

          {/* Primary Action: Merge */}
          <button
            onClick={() => handleMerge(bestSimilar.statementId)}
            className={`${styles.chooseButton} ${styles.primary}`}
          >
            {t('Merge & Strengthen')} ✨
          </button>
        </div>
      </div>

      {/* Other Similar Solutions (if more than one) */}
      {topSimilar.length > 1 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('Other similar proposals')}</h3>
          {topSimilar.slice(1).map((solution) => (
            <div key={solution.statementId} className={styles.similarCard}>
              <div className={styles.similarMeta}>
                <span className={styles.similarityScore}>
                  {Math.round(((solution as Statement & { similarity?: number }).similarity ?? 0.75) * 100)}% {t('similar')}
                </span>
                <span className={styles.supportCount}>
                  👥 {solution.evaluation?.numberOfEvaluators || 0}
                </span>
              </div>
              <div className={styles.solutionText}>{solution.statement}</div>
              <button
                onClick={() => handleMerge(solution.statementId)}
                className={`${styles.chooseButton} ${styles.secondary}`}
              >
                {t('Merge with this')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Keep Separate Link (small, secondary) */}
      <div className={styles.keepSeparateSection}>
        <button
          onClick={handleKeepSeparateClick}
          className={styles.keepSeparateLink}
        >
          {t('Keep as separate proposal')}
        </button>
      </div>

      {/* Educational Footer */}
      <div className={styles.helpFooter}>
        <span className={styles.helpIcon}>💡</span>
        <p className={styles.helpText}>
          {t('Merging preserves your voice while building stronger consensus together.')}
        </p>
      </div>

      {/* Back Button */}
      <button onClick={onBack} className={styles.backButton}>
        ← {t('Back to Edit')}
      </button>
    </div>
  );
}
