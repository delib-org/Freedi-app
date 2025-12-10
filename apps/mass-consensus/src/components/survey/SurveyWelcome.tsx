'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { SurveyWithQuestions } from '@/types/survey';
import styles from './Survey.module.scss';

interface SurveyWelcomeProps {
  survey: SurveyWithQuestions;
}

/**
 * Welcome screen shown when user first enters a survey
 */
export default function SurveyWelcome({ survey }: SurveyWelcomeProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const handleStart = () => {
    router.push(`/s/${survey.surveyId}/q/0`);
  };

  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeContent}>
        <h1 className={styles.welcomeTitle}>{survey.title}</h1>

        {survey.description && (
          <p className={styles.welcomeDescription}>{survey.description}</p>
        )}

        <div className={styles.welcomeInfo}>
          <div className={styles.infoItem}>
            <span className={styles.infoNumber}>{survey.questions.length}</span>
            <span className={styles.infoLabel}>{t('questions')}</span>
          </div>
        </div>

        <div className={styles.welcomeInstructions}>
          <h3>{t('howItWorks')}</h3>
          <ol>
            <li>{t('surveyInstruction1')}</li>
            <li>{t('surveyInstruction2')}</li>
            <li>{t('surveyInstruction3')}</li>
          </ol>
        </div>

        <button
          className={styles.startButton}
          onClick={handleStart}
        >
          {t('startSurvey')}
        </button>
      </div>
    </div>
  );
}
