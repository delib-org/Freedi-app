'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { SurveySettings } from '@/types/survey';
import styles from './Survey.module.scss';

interface SurveyNavigationProps {
  surveyId: string;
  currentIndex: number;
  totalQuestions: number;
  evaluatedCount: number;
  availableOptionsCount: number;
  settings: SurveySettings;
  onNavigate?: (direction: 'back' | 'next') => void;
}

/**
 * Fixed bottom navigation bar with Back/Next buttons
 */
export default function SurveyNavigation({
  surveyId,
  currentIndex,
  totalQuestions,
  evaluatedCount,
  availableOptionsCount,
  settings,
  onNavigate,
}: SurveyNavigationProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const isFirstQuestion = currentIndex === 0;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // Calculate effective minimum - can't require more evaluations than available options
  const effectiveMinEvaluations = availableOptionsCount > 0
    ? Math.min(settings.minEvaluationsPerQuestion, availableOptionsCount)
    : settings.minEvaluationsPerQuestion;

  // Check if user can proceed to next question
  const canProceed = settings.allowSkipping || evaluatedCount >= effectiveMinEvaluations;
  const evaluationsNeeded = Math.max(0, effectiveMinEvaluations - evaluatedCount);

  const handleBack = () => {
    if (settings.allowReturning && currentIndex > 0) {
      onNavigate?.('back');
      router.push(`/s/${surveyId}/q/${currentIndex - 1}`);
    }
  };

  const handleNext = () => {
    if (!canProceed) return;

    onNavigate?.('next');

    if (isLastQuestion) {
      router.push(`/s/${surveyId}/complete`);
    } else {
      router.push(`/s/${surveyId}/q/${currentIndex + 1}`);
    }
  };

  return (
    <div className={styles.navContainer}>
      <div className={styles.navContent}>
        <button
          className={`${styles.navButton} ${styles.back}`}
          onClick={handleBack}
          disabled={isFirstQuestion || !settings.allowReturning}
        >
          <ArrowLeftIcon />
          {t('back')}
        </button>

        <button
          className={`${styles.navButton} ${isLastQuestion ? styles.finish : styles.next}`}
          onClick={handleNext}
          disabled={!canProceed}
        >
          {isLastQuestion ? t('finish') : t('next')}
          {!isLastQuestion && <ArrowRightIcon />}
        </button>
      </div>

      {!canProceed && evaluationsNeeded > 0 && (
        <div className={styles.navHint}>
          {t('evaluationsNeeded').replace('{count}', String(evaluationsNeeded))}
        </div>
      )}
    </div>
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
