'use client';

import { useEffect, useState } from 'react';
import { Statement, SuggestionMode } from '@freedi/shared-types';
import { VALIDATION, UI } from '@/constants/common';
import { useTranslation } from '@freedi/shared-i18n/next';
import InlineMarkdown from '../shared/InlineMarkdown';
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
  /** Controls UX friction for adding new vs merging */
  suggestionMode?: SuggestionMode;
}

export default function SimilarSolutions({
  userSuggestion,
  similarSolutions,
  onSelect,
  onMerge,
  onBack,
  enableAutoMerge: _enableAutoMerge = true,
  suggestionMode = SuggestionMode.encourage,
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

  // ENCOURAGE MODE: "Add as New" is primary, merge is secondary
  if (suggestionMode === SuggestionMode.encourage) {
    return (
      <div className={`${styles.container} ${styles.encourageMode}`}>
        {/* Header - Encourages unique ideas */}
        <div className={styles.header}>
          <h2>{t('similarIdeasExist') || 'Similar ideas exist'} 💭</h2>
          <p>{t('yoursMightBeDifferent') || 'But yours might be different!'}</p>
        </div>

        {/* Primary: YOUR SOLUTION */}
        <div className={styles.section}>
          <div className={styles.yourSolutionCard}>
            <div className={styles.yourSolutionLabel}>{t('yourIdea') || 'Your idea:'}</div>
            <p className={styles.yourSolutionText}>{userSuggestion}</p>
            <button
              onClick={() => onSelect(null)}
              className={`${styles.chooseButton} ${styles.primary}`}
            >
              {t('addAsNewSolution') || 'Add as New Solution'} ✨
            </button>
          </div>
        </div>

        {/* Secondary: Similar Solutions to potentially merge */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('orMergeWithExisting') || 'Or merge with existing:'}</h3>
          {topSimilar.map((solution) => (
            <div key={solution.statementId} className={styles.similarCard}>
              <div className={styles.similarMeta}>
                <span className={styles.similarityScore}>
                  {Math.round(((solution as Statement & { similarity?: number }).similarity ?? 0.75) * 100)}% {t('similar')}
                </span>
                <span className={styles.supportCount}>
                  👥 {solution.evaluation?.numberOfEvaluators || 0}
                </span>
              </div>
              <div className={styles.solutionText}>
                <InlineMarkdown text={solution.statement} />
              </div>
              <button
                onClick={() => handleMerge(solution.statementId)}
                className={`${styles.chooseButton} ${styles.secondary}`}
              >
                {t('mergeWithThis') || 'Merge with this'}
              </button>
            </div>
          ))}
        </div>

        {/* Back Button */}
        <button onClick={onBack} className={styles.backButton}>
          ← {t('backToEdit') || 'Back to Edit'}
        </button>
      </div>
    );
  }

  // BALANCED MODE: Both options shown equally
  if (suggestionMode === SuggestionMode.balanced) {
    return (
      <div className={`${styles.container} ${styles.balancedMode}`}>
        {/* Header - Neutral */}
        <div className={styles.header}>
          <h2>{t('similarSuggestionsFound') || 'We found similar suggestions'} 🔍</h2>
          <p>{t('chooseHowToProceed') || 'Choose how you\'d like to proceed'}</p>
        </div>

        {/* Two Equal Options */}
        <div className={styles.balancedOptions}>
          <button
            onClick={() => onSelect(null)}
            className={`${styles.balancedButton} ${styles.addNew}`}
          >
            <span className={styles.balancedIcon}>✨</span>
            <span className={styles.balancedLabel}>{t('addAsNew') || 'Add as New'}</span>
            <span className={styles.balancedDesc}>{t('createUniqueSuggestion') || 'Create your unique suggestion'}</span>
          </button>
          <button
            onClick={() => handleMerge(bestSimilar.statementId)}
            className={`${styles.balancedButton} ${styles.merge}`}
          >
            <span className={styles.balancedIcon}>🤝</span>
            <span className={styles.balancedLabel}>{t('mergeWithBest') || 'Merge with Best Match'}</span>
            <span className={styles.balancedDesc}>{t('strengthenExisting') || 'Strengthen existing idea'}</span>
          </button>
        </div>

        {/* Your Suggestion Preview */}
        <div className={styles.suggestionPreview}>
          <span className={styles.previewLabel}>{t('yourSuggestion') || 'Your suggestion:'}</span>
          <p>{userSuggestion}</p>
        </div>

        {/* Similar Solutions List */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('similarSolutions') || 'Similar solutions:'}</h3>
          {topSimilar.map((solution) => (
            <div key={solution.statementId} className={styles.similarCard}>
              <div className={styles.similarMeta}>
                <span className={styles.similarityScore}>
                  {Math.round(((solution as Statement & { similarity?: number }).similarity ?? 0.75) * 100)}% {t('similar')}
                </span>
                <span className={styles.supportCount}>
                  👥 {solution.evaluation?.numberOfEvaluators || 0}
                </span>
              </div>
              <div className={styles.solutionText}>
                <InlineMarkdown text={solution.statement} />
              </div>
              <button
                onClick={() => handleMerge(solution.statementId)}
                className={styles.mergeSmallButton}
              >
                {t('merge') || 'Merge'}
              </button>
            </div>
          ))}
        </div>

        {/* Back Button */}
        <button onClick={onBack} className={styles.backButton}>
          ← {t('backToEdit') || 'Back to Edit'}
        </button>
      </div>
    );
  }

  // RESTRICT MODE (default/current behavior): Merge is primary, add new requires confirmation
  return (
    <div className={`${styles.container} ${styles.restrictMode}`}>
      {/* Keep Separate Confirmation Modal */}
      {showKeepSeparateModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}>💡</span>
              <h3>{t('whyMerge') || 'Why merge?'}</h3>
            </div>
            <div className={styles.modalContent}>
              <ul className={styles.benefitsList}>
                <li>{t('voicePreserved') || 'Your voice is preserved in the merged proposal'}</li>
                <li>{t('strongerTogether') || 'Stronger together = more impact'}</li>
                <li>{t('avoidsVoteSplitting') || 'Avoids vote splitting between similar ideas'}</li>
              </ul>
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowKeepSeparateModal(false)}
                className={styles.mergeAnywayButton}
              >
                {t('mergeAnyway') || 'Merge Anyway'}
              </button>
              <button
                onClick={handleConfirmKeepSeparate}
                className={styles.keepSeparateConfirmButton}
              >
                {t('keepSeparate') || 'Keep Separate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header - Updated messaging for merge-first approach */}
      <div className={styles.header}>
        <h2>{t('similarProposalFound') || 'Similar proposal found!'} 👥</h2>
        <p>{t('yourIdeaWillBeMerged') || 'Your idea will be merged to strengthen this proposal'}</p>
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
          <div className={styles.solutionText}>
            <InlineMarkdown text={bestSimilar.statement} />
          </div>

          {/* Your addition preview */}
          <div className={styles.yourAddition}>
            <span className={styles.yourAdditionLabel}>{t('yourAddition') || 'Your addition:'}</span>
            <p className={styles.yourAdditionText}>{userSuggestion}</p>
          </div>

          {/* Primary Action: Merge */}
          <button
            onClick={() => handleMerge(bestSimilar.statementId)}
            className={`${styles.chooseButton} ${styles.primary}`}
          >
            {t('mergeAndStrengthen') || 'Merge & Strengthen'} ✨
          </button>
        </div>
      </div>

      {/* Other Similar Solutions (if more than one) */}
      {topSimilar.length > 1 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('otherSimilarProposals') || 'Other similar proposals'}</h3>
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
              <div className={styles.solutionText}>
                <InlineMarkdown text={solution.statement} />
              </div>
              <button
                onClick={() => handleMerge(solution.statementId)}
                className={`${styles.chooseButton} ${styles.secondary}`}
              >
                {t('mergeWithThis') || 'Merge with this'}
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
          {t('keepAsSeparateProposal') || 'Keep as separate proposal'}
        </button>
      </div>

      {/* Educational Footer */}
      <div className={styles.helpFooter}>
        <span className={styles.helpIcon}>💡</span>
        <p className={styles.helpText}>
          {t('mergingPreservesVoice') || 'Merging preserves your voice while building stronger consensus together.'}
        </p>
      </div>

      {/* Back Button */}
      <button onClick={onBack} className={styles.backButton}>
        ← {t('backToEdit') || 'Back to Edit'}
      </button>
    </div>
  );
}
