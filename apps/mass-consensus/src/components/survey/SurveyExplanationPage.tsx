'use client';

import { useRouter } from 'next/navigation';
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

  const totalFlowLength = getTotalFlowLength(survey);
  const isLastItem = currentFlowIndex === totalFlowLength - 1;

  const handleNext = () => {
    if (isLastItem) {
      router.push(`/s/${survey.surveyId}/complete`);
    } else {
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex + 1}`);
    }
  };

  const handleBack = () => {
    if (currentFlowIndex > 0 && survey.settings.allowReturning) {
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex - 1}`);
    }
  };

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
          <img
            src={explanationPage.heroImageUrl}
            alt=""
            className={styles.explanationHero}
            role="presentation"
          />
        )}

        <div className={styles.explanationBody}>
          <h1 className={styles.explanationTitle}>{explanationPage.title}</h1>
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
              className={`${styles.navButton} ${styles.back}`}
              onClick={handleBack}
            >
              {t('back') || 'Back'}
            </button>
          )}

          <div className={styles.navSpacer} />

          <button
            type="button"
            className={`${styles.navButton} ${isLastItem ? styles.finish : styles.next}`}
            onClick={handleNext}
          >
            {isLastItem ? t('finish') || 'Finish' : t('continue') || 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
