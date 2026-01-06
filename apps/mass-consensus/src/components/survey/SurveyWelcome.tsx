'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { SurveyWithQuestions, SurveyProgress } from '@/types/survey';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import styles from './Survey.module.scss';

interface SurveyWelcomeProps {
  survey: SurveyWithQuestions;
}

interface ProgressResponse extends Partial<SurveyProgress> {
  hasProgress: boolean;
}

/**
 * Welcome screen shown when user first enters a survey
 */
export default function SurveyWelcome({ survey }: SurveyWelcomeProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showResumeModal, setShowResumeModal] = useState(false);

  // Fetch user's progress on mount
  useEffect(() => {
    const fetchProgress = async () => {
      try {
        // Get or create anonymous user ID (sets cookie for API requests)
        getOrCreateAnonymousUser();

        const response = await fetch(`/api/surveys/${survey.surveyId}/progress`, {
          credentials: 'include',
        });

        if (response.ok) {
          const data: ProgressResponse = await response.json();
          setProgress(data);

          // Show resume modal if user has started but not completed
          if (data.hasProgress && !data.isCompleted && (data.currentQuestionIndex ?? 0) > 0) {
            setShowResumeModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch progress:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProgress();
  }, [survey.surveyId]);

  const handleStart = () => {
    router.push(`/s/${survey.surveyId}/q/0`);
  };

  const handleContinue = () => {
    const questionIndex = progress?.currentQuestionIndex ?? 0;
    router.push(`/s/${survey.surveyId}/q/${questionIndex}`);
  };

  const handleStartOver = () => {
    setShowResumeModal(false);
    router.push(`/s/${survey.surveyId}/q/0`);
  };

  // Show loading state briefly
  if (isLoading) {
    return (
      <div className={styles.welcome}>
        <div className={styles.welcomeContent}>
          <div className={styles.loadingSpinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeContent}>
        <h1 className={styles.welcomeTitle}>{survey.title}</h1>

        {survey.description && (
          <p className={styles.welcomeDescription}>{survey.description}</p>
        )}

        {/* Introduction text - can be customized or hidden by admin */}
        {(survey.showIntro !== false) && (
          <div className={styles.welcomeInstructions}>
            <p>{survey.customIntroText || t('surveyDescription')}</p>
          </div>
        )}

        <button
          className={styles.startButton}
          onClick={handleStart}
        >
          {t('startSurvey')}
        </button>
      </div>

      {/* Resume Modal */}
      {showResumeModal && (
        <div className={styles.resumeModal}>
          <div className={styles.resumeContent}>
            <h2 className={styles.resumeTitle}>{t('welcomeBack')}</h2>
            <p className={styles.resumeDescription}>
              {t('continueFrom')
                .replace('{{num}}', String((progress?.currentQuestionIndex ?? 0) + 1))
                .replace('{{total}}', String(survey.questions.length))}
            </p>
            <div className={styles.resumeProgress}>
              <div
                className={styles.resumeProgressBar}
                style={{
                  width: `${((progress?.completedQuestionIds?.length ?? 0) / survey.questions.length) * 100}%`
                }}
              />
            </div>
            <p className={styles.resumeStats}>
              {progress?.completedQuestionIds?.length ?? 0} / {survey.questions.length} {t('questionsCompleted')}
            </p>
            <div className={styles.resumeActions}>
              <button
                className={styles.resumeButton}
                onClick={handleContinue}
              >
                {t('continue')}
              </button>
              <button
                className={styles.startOverButton}
                onClick={handleStartOver}
              >
                {t('startOver')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
