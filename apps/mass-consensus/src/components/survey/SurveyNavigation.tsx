'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import styles from './Survey.module.scss';

interface SurveyNavigationProps {
  surveyId: string;
  currentIndex: number;
  totalQuestions: number;
  evaluatedCount: number;
  availableOptionsCount: number;
  /** Number of solutions this user has contributed to this question */
  userSolutionCount?: number;
  /** Merged settings for the current question (survey + per-question overrides) */
  mergedSettings: MergedQuestionSettings;
  /** Survey-level allowReturning setting (not per-question) */
  allowReturning?: boolean;
  onNavigate?: (direction: 'back' | 'next') => void;
  // Action buttons props
  showAddSuggestion?: boolean;
  showViewProgress?: boolean;
  onAddSuggestion?: () => void;
  onViewProgress?: () => void;
}

/**
 * Fixed bottom navigation bar with Back/Next buttons and action buttons
 */
export default function SurveyNavigation({
  surveyId,
  currentIndex,
  totalQuestions,
  evaluatedCount,
  availableOptionsCount,
  userSolutionCount = 0,
  mergedSettings,
  allowReturning = true,
  onNavigate,
  showAddSuggestion = false,
  showViewProgress = false,
  onAddSuggestion,
  onViewProgress,
}: SurveyNavigationProps) {
  const router = useRouter();
  const { t, tWithParams } = useTranslation();

  // Loading states for navigation buttons
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);

  const isNavigating = isNavigatingBack || isNavigatingNext;

  const isFirstQuestion = currentIndex === 0;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // Calculate evaluatable options (excluding user's own solutions - they can't evaluate their own)
  const evaluatableOptionsCount = Math.max(0, availableOptionsCount - userSolutionCount);

  // Detect "contributor-only" mode: user has added solutions but has no others to evaluate
  // In this case, allow them to proceed since they've contributed and can't do more
  const isContributorOnlyMode = userSolutionCount > 0 && evaluatableOptionsCount === 0;

  // Calculate effective minimum - can't require more evaluations than evaluatable options
  // If evaluatableOptionsCount is 0 but user has evaluated some, use evaluatedCount as the known minimum
  const knownOptionsCount = evaluatableOptionsCount > 0 ? evaluatableOptionsCount : evaluatedCount;
  const effectiveMinEvaluations = knownOptionsCount > 0
    ? Math.min(mergedSettings.minEvaluationsPerQuestion, knownOptionsCount)
    : mergedSettings.minEvaluationsPerQuestion;

  // Check if user can proceed to next question
  // Allow proceeding if:
  // - Skipping is allowed, OR
  // - User has met minimum evaluations, OR
  // - User has evaluated all visible options, OR
  // - User is in contributor-only mode (added solutions but can't evaluate any)
  const hasEvaluatedAllVisible = evaluatableOptionsCount > 0 && evaluatedCount >= evaluatableOptionsCount;
  const canProceed = mergedSettings.allowSkipping ||
    evaluatedCount >= effectiveMinEvaluations ||
    hasEvaluatedAllVisible ||
    isContributorOnlyMode;
  const evaluationsNeeded = Math.max(0, effectiveMinEvaluations - evaluatedCount);

  const handleBack = useCallback(() => {
    if (isNavigating) return; // Prevent double-clicks
    if (allowReturning && currentIndex > 0) {
      setIsNavigatingBack(true);
      onNavigate?.('back');
      router.push(`/s/${surveyId}/q/${currentIndex - 1}`);
    }
  }, [isNavigating, allowReturning, currentIndex, onNavigate, router, surveyId]);

  const handleNext = useCallback(() => {
    if (isNavigating) return; // Prevent double-clicks
    if (!canProceed) return;

    setIsNavigatingNext(true);
    onNavigate?.('next');

    if (isLastQuestion) {
      router.push(`/s/${surveyId}/complete`);
    } else {
      router.push(`/s/${surveyId}/q/${currentIndex + 1}`);
    }
  }, [isNavigating, canProceed, onNavigate, isLastQuestion, router, surveyId, currentIndex]);

  return (
    <div className={styles.navContainer}>
      <div className={styles.navContent}>
        <button
          className={`${styles.navButton} ${styles.back} ${isNavigatingBack ? styles.loading : ''}`}
          onClick={handleBack}
          disabled={isFirstQuestion || !allowReturning || isNavigating}
          aria-busy={isNavigatingBack}
          aria-label={isNavigatingBack ? t('loading') : t('back')}
        >
          {isNavigatingBack ? (
            <ButtonSpinner />
          ) : (
            <>
              <ArrowLeftIcon />
              {t('back')}
            </>
          )}
        </button>

        {/* Action Buttons - Add Suggestion and View Progress */}
        <div className={styles.navActionButtons}>
          {showAddSuggestion && onAddSuggestion && (
            <button
              className={styles.navActionButton}
              onClick={onAddSuggestion}
              title={t('Add Suggestion')}
              disabled={isNavigating}
            >
              <PlusIcon />
            </button>
          )}
          {showViewProgress && onViewProgress && (
            <button
              className={styles.navActionButton}
              onClick={onViewProgress}
              title={t('View Progress')}
              disabled={isNavigating}
            >
              <ChartIcon />
            </button>
          )}
        </div>

        <button
          className={`${styles.navButton} ${isLastQuestion ? styles.finish : styles.next} ${isNavigatingNext ? styles.loading : ''}`}
          onClick={handleNext}
          disabled={!canProceed || isNavigating}
          aria-busy={isNavigatingNext}
          aria-label={isNavigatingNext ? t('loading') : (isLastQuestion ? t('finish') : t('next'))}
        >
          {isNavigatingNext ? (
            <ButtonSpinner />
          ) : (
            <>
              {isLastQuestion ? t('finish') : t('next')}
              {!isLastQuestion && <ArrowRightIcon />}
            </>
          )}
        </button>
      </div>

      {/* Navigation hint - show different message based on state */}
      {isContributorOnlyMode ? (
        <div className={`${styles.navHint} ${styles.navHintSuccess}`}>
          {t('contributorOnlyMessage')}
        </div>
      ) : !canProceed && evaluationsNeeded > 0 ? (
        <div className={styles.navHint}>
          {tWithParams('evaluationsNeeded', { count: evaluationsNeeded })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Small spinner for use inside buttons during loading state
 */
function ButtonSpinner() {
  return (
    <span className={styles.buttonSpinner} role="status" aria-label="Loading">
      <svg
        className={styles.buttonSpinnerSvg}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className={styles.buttonSpinnerCircle}
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}
