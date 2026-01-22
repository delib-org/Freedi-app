'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyExplanationPage as SurveyExplanationPageType } from '@freedi/shared-types';
import { SurveyWithQuestions, getTotalFlowLength } from '@/types/survey';
import SurveyProgressBar from './SurveyProgress';
import MarkdownRenderer from '../shared/MarkdownRenderer';
import styles from './Survey.module.scss';

interface SurveyExplanationPageProps {
  survey: SurveyWithQuestions;
  explanationPage: SurveyExplanationPageType;
  currentFlowIndex: number;
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

/**
 * User-facing component for displaying explanation pages in the survey flow.
 * These pages are always skippable - users can immediately click Next/Continue.
 */
export default function SurveyExplanationPage({
  survey,
  explanationPage,
  currentFlowIndex,
}: SurveyExplanationPageProps) {
  const router = useRouter();
  const { t } = useTranslation();

  // Loading states for navigation buttons
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);

  const isNavigating = isNavigatingBack || isNavigatingNext;

  const totalFlowLength = getTotalFlowLength(survey);
  const isLastItem = currentFlowIndex === totalFlowLength - 1;

  const handleNext = useCallback(() => {
    if (isNavigating) return; // Prevent double-clicks
    setIsNavigatingNext(true);

    // Save progress to server for statistics tracking
    fetch(`/api/surveys/${survey.surveyId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        currentQuestionIndex: currentFlowIndex + 1,
        isCompleted: isLastItem,
      }),
    }).catch((error) => {
      console.error('[SurveyExplanationPage] Failed to save progress to server:', error);
    });

    if (isLastItem) {
      router.push(`/s/${survey.surveyId}/complete`);
    } else {
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex + 1}`);
    }
  }, [isNavigating, isLastItem, router, survey.surveyId, currentFlowIndex]);

  const handleBack = useCallback(() => {
    if (isNavigating) return; // Prevent double-clicks
    if (currentFlowIndex > 0 && survey.settings.allowReturning) {
      setIsNavigatingBack(true);
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex - 1}`);
    }
  }, [isNavigating, currentFlowIndex, survey.settings.allowReturning, router, survey.surveyId]);

  return (
    <div className={styles.explanationWrapper}>
      <SurveyProgressBar
        currentIndex={currentFlowIndex}
        totalQuestions={totalFlowLength}
        completedIndices={[]}
        isExplanation
      />

      <div className={styles.explanationContent}>
        {/* Hero image if provided */}
        {explanationPage.heroImageUrl && (
          <div style={{ position: 'relative', width: '100%', height: '200px' }}>
            <Image
              src={explanationPage.heroImageUrl}
              alt=""
              fill
              className={styles.explanationHero}
              style={{ objectFit: 'cover' }}
              role="presentation"
              unoptimized
            />
          </div>
        )}

        <div className={styles.explanationBody}>
          <div className={styles.explanationText}>
            <MarkdownRenderer content={explanationPage.content} />
          </div>
        </div>
      </div>

      <div className={styles.navContainer}>
        <div className={styles.navContent}>
          {survey.settings.allowReturning && currentFlowIndex > 0 && (
            <button
              type="button"
              className={`${styles.navButton} ${styles.back} ${isNavigatingBack ? styles.loading : ''}`}
              onClick={handleBack}
              disabled={isNavigating}
              aria-busy={isNavigatingBack}
              aria-label={isNavigatingBack ? (t('loading') || 'Loading') : (t('back') || 'Back')}
            >
              {isNavigatingBack ? <ButtonSpinner /> : (t('back') || 'Back')}
            </button>
          )}

          <div className={styles.navSpacer} />

          <button
            type="button"
            className={`${styles.navButton} ${isLastItem ? styles.finish : styles.next} ${isNavigatingNext ? styles.loading : ''}`}
            onClick={handleNext}
            disabled={isNavigating}
            aria-busy={isNavigatingNext}
            aria-label={isNavigatingNext ? (t('loading') || 'Loading') : (isLastItem ? t('finish') || 'Finish' : t('continue') || 'Continue')}
          >
            {isNavigatingNext ? <ButtonSpinner /> : (isLastItem ? t('finish') || 'Finish' : t('continue') || 'Continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
