'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { SurveyWithQuestions } from '@/types/survey';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { logError } from '@/lib/utils/errorHandling';
import WizColAttribution from '../shared/WizColAttribution';
import styles from './Survey.module.scss';

interface SurveyCompleteProps {
  survey: SurveyWithQuestions;
}

interface SurveyStats {
  questionsCompleted: number;
  totalQuestions: number;
}

interface QuestionProgress {
  questionId: string;
  questionText: string;
  totalOptions: number;
  evaluatedCount: number;
}

interface DemographicProgress {
  pageId: string;
  pageTitle: string;
  isCompleted: boolean;
}

interface DetailedProgress {
  questions: QuestionProgress[];
  demographics: DemographicProgress[];
  overall: {
    questionsCompleted: number;
    totalQuestions: number;
    totalOptionsEvaluated: number;
    demographicsCompleted: number;
    totalDemographicPages: number;
  };
}

/**
 * Completion screen shown after finishing all questions
 */
export default function SurveyComplete({ survey }: SurveyCompleteProps) {
  const router = useRouter();
  const { t, tWithParams } = useTranslation();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasSuggestions, setHasSuggestions] = useState(false);
  const [detailedProgress, setDetailedProgress] = useState<DetailedProgress | null>(null);
  const [stats, setStats] = useState<SurveyStats>({
    questionsCompleted: 0,
    totalQuestions: survey.questions.length,
  });

  // Load stats from localStorage
  useEffect(() => {
    const storageKey = `survey_progress_${survey.surveyId}`;
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        const data = JSON.parse(stored);
        setStats({
          questionsCompleted: (data.completedIndices || []).length,
          totalQuestions: survey.questions.length,
        });
      } catch {
        logError(new Error('Error parsing stored progress'), {
          operation: 'SurveyComplete.parseProgress',
          metadata: { surveyId: survey.surveyId },
        });
      }
    }
  }, [survey.surveyId, survey.questions.length]);

  // Fetch detailed progress from API
  useEffect(() => {
    const fetchDetailedProgress = async () => {
      try {
        const userId = getOrCreateAnonymousUser();
        const response = await fetch(
          `/api/surveys/${survey.surveyId}/detailed-progress?userId=${encodeURIComponent(userId)}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data: DetailedProgress = await response.json();
          setDetailedProgress(data);

          // Update stats from server data if available
          if (data.overall) {
            setStats({
              questionsCompleted: data.overall.questionsCompleted,
              totalQuestions: data.overall.totalQuestions,
            });
          }
        }
      } catch (error) {
        logError(error, {
          operation: 'SurveyComplete.fetchDetailedProgress',
          metadata: { surveyId: survey.surveyId },
        });
      }
    };

    fetchDetailedProgress();
  }, [survey.surveyId]);

  // Check if user has submitted suggestions
  useEffect(() => {
    const checkSuggestions = async () => {
      try {
        const userId = getOrCreateAnonymousUser();
        const results = await Promise.all(
          survey.questionIds.map((questionId) =>
            fetch(`/api/user-solutions/${questionId}?userId=${encodeURIComponent(userId)}`)
              .then((res) => res.ok ? res.json() : { solutionCount: 0 })
              .catch(() => ({ solutionCount: 0 }))
          )
        );

        const total = results.reduce(
          (sum: number, r: { solutionCount?: number }) => sum + (r.solutionCount || 0),
          0
        );
        setHasSuggestions(total > 0);
      } catch {
        // Silently fail - button won't show
      }
    };

    checkSuggestions();
  }, [survey.questionIds]);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Subscribe to results for all questions in the survey
      const subscribePromises = survey.questionIds.map((questionId) =>
        fetch(`/api/statements/${questionId}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
      );

      await Promise.all(subscribePromises);
      setIsSubscribed(true);
    } catch (error) {
      logError(error, {
        operation: 'SurveyComplete.handleEmailSubmit',
        metadata: { surveyId: survey.surveyId },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewQuestions = () => {
    router.push(`/s/${survey.surveyId}/q/0`);
  };

  const handleViewMySuggestions = () => {
    router.push(`/my-suggestions?surveyId=${survey.surveyId}`);
  };

  return (
    <div className={styles.complete}>
      <div className={styles.completeIcon}>
        <CheckIcon />
      </div>

      <h1 className={styles.completeTitle}>{t('surveyComplete')}</h1>
      <p className={styles.completeSubtitle}>{t('thankYouForParticipating')}</p>

      <div className={styles.completeSummary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryNumber}>{stats.questionsCompleted}</span>
          <span className={styles.summaryLabel}>{t('questionsAnswered')}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryNumber}>
            {detailedProgress?.overall.totalOptionsEvaluated ?? 0}
          </span>
          <span className={styles.summaryLabel}>{t('optionsEvaluated')}</span>
        </div>
      </div>

      {/* Per-question detailed progress */}
      {detailedProgress && detailedProgress.questions.length > 0 && (
        <div className={styles.detailedProgress}>
          <h3 className={styles.detailedProgressTitle}>{t('yourEvaluationSummary')}</h3>
          <div className={styles.questionProgressList}>
            {detailedProgress.questions.map((q) => {
              const pct = q.totalOptions > 0
                ? Math.min(100, Math.round((q.evaluatedCount / q.totalOptions) * 100))
                : 0;
              return (
                <div key={q.questionId} className={styles.questionProgressRow}>
                  <span className={styles.questionProgressText}>
                    {q.questionText}
                  </span>
                  <div className={styles.questionProgressBarTrack}>
                    <div
                      className={styles.questionProgressBarFill}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={styles.questionProgressCount}>
                    {tWithParams('optionsRated', {
                      evaluated: q.evaluatedCount,
                      total: q.totalOptions,
                    })}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Demographic sections */}
          {detailedProgress.demographics.length > 0 && (
            <>
              <h4 className={styles.detailedProgressSubtitle}>{t('demographicSections')}</h4>
              <div className={styles.demographicProgressList}>
                {detailedProgress.demographics.map((d) => (
                  <div key={d.pageId} className={styles.demographicProgressRow}>
                    <span className={styles.demographicProgressText}>{d.pageTitle}</span>
                    <span
                      className={
                        d.isCompleted
                          ? styles.demographicStatusComplete
                          : styles.demographicStatusIncomplete
                      }
                    >
                      {d.isCompleted ? t('sectionCompleted') : t('sectionNotCompleted')}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {survey.showEmailSignup !== false && (
        !isSubscribed ? (
          <div className={styles.emailSignup}>
            <h3 className={styles.emailTitle}>{survey.customEmailTitle || t('stayUpdated')}</h3>
            <p className={styles.emailDescription}>{survey.customEmailDescription || t('emailSignupDescription')}</p>
            <form className={styles.emailForm} onSubmit={handleEmailSubmit}>
              <input
                type="email"
                className={styles.emailInput}
                placeholder={t('enterEmail')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                className={styles.emailSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? t('subscribing') : t('subscribe')}
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.emailSignup}>
            <p style={{ color: 'var(--agree)', fontWeight: 600 }}>
              {t('subscribedSuccessfully')}
            </p>
          </div>
        )
      )}

      <div className={styles.completeActions}>
        {hasSuggestions && (
          <button
            className={`${styles.actionButton} ${styles.primary}`}
            onClick={handleViewMySuggestions}
          >
            {t('viewMySuggestions')}
          </button>
        )}
        <button
          className={`${styles.actionButton} ${styles.secondary}`}
          onClick={handleViewQuestions}
        >
          {t('reviewAnswers')}
        </button>
      </div>

      <WizColAttribution />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
