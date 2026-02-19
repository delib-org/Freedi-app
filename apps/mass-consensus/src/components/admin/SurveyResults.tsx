'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { Survey } from '@/types/survey';
import styles from './Admin.module.scss';

interface QuestionResult {
  index: number;
  statementId: string;
  statement: string;
}

interface DemographicOptionCount {
  option: string;
  count: number;
}

interface DemographicQuestionResult {
  userQuestionId: string;
  question: string;
  type: string;
  totalResponses: number;
  optionCounts?: DemographicOptionCount[];
  numericStats?: {
    min: number;
    max: number;
    average: number;
  };
}

interface ResultsData {
  questions: QuestionResult[];
  demographics: DemographicQuestionResult[];
}

interface SubscribersData {
  emails: string[];
  count: number;
}

interface SurveyResultsProps {
  survey: Survey;
}

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL || 'https://app.wizcol.com';

/**
 * Component to display survey results: questions and demographic data
 */
export default function SurveyResults({ survey }: SurveyResultsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshToken } = useAuth();
  const [results, setResults] = useState<ResultsData | null>(null);
  const [subscribers, setSubscribers] = useState<SubscribersData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailsCopied, setEmailsCopied] = useState(false);

  const fetchResults = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));

        return;
      }

      const [resultsResponse, subscribersResponse] = await Promise.all([
        fetch(`/api/surveys/${survey.surveyId}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/surveys/${survey.surveyId}/subscribers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!resultsResponse.ok) {
        throw new Error('Failed to fetch results');
      }

      const data: ResultsData = await resultsResponse.json();
      setResults(data);

      if (subscribersResponse.ok) {
        const subscribersData: SubscribersData = await subscribersResponse.json();
        setSubscribers(subscribersData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch results');
    } finally {
      setIsLoading(false);
    }
  }, [survey.surveyId, refreshToken, router]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button className={styles.retryButton} onClick={fetchResults}>
          {t('retry')}
        </button>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  const handleCopyEmails = async () => {
    if (!subscribers || subscribers.emails.length === 0) return;

    const emailText = subscribers.emails.join(', ');
    try {
      await navigator.clipboard.writeText(emailText);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = emailText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setEmailsCopied(true);
    setTimeout(() => setEmailsCopied(false), 2000);
  };

  const hasQuestions = results.questions.length > 0;
  const hasDemographics = results.demographics.length > 0;

  return (
    <div className={styles.resultsContainer}>
      {/* Questions Section */}
      <div className={styles.resultsSection}>
        <h2 className={styles.resultsSectionTitle}>{t('questionsInSurvey')}</h2>
        {hasQuestions ? (
          <div className={styles.resultsQuestionsList}>
            {results.questions.map((q) => (
              <div key={q.statementId} className={styles.resultsQuestionCard}>
                <div className={styles.resultsQuestionInfo}>
                  <span className={styles.resultsQuestionNumber}>{q.index}</span>
                  <span className={styles.resultsQuestionText}>{q.statement}</span>
                </div>
                <a
                  href={`${MAIN_APP_URL}/statement/${q.statementId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.resultsViewLink}
                >
                  {t('viewInMainApp')}
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.resultsEmpty}>{t('noResponsesYet')}</p>
        )}
      </div>

      {/* Demographics Section */}
      {hasDemographics && (
        <div className={styles.resultsSection}>
          <h2 className={styles.resultsSectionTitle}>{t('demographicResults')}</h2>
          <div className={styles.resultsDemographicsList}>
            {results.demographics.map((dq) => (
              <div key={dq.userQuestionId} className={styles.resultsDemographicCard}>
                <div className={styles.resultsDemographicHeader}>
                  <span className={styles.resultsDemographicQuestion}>{dq.question}</span>
                  <span className={styles.resultsDemographicType}>{dq.type}</span>
                </div>
                <div className={styles.resultsDemographicMeta}>
                  {t('totalResponses')}: {dq.totalResponses}
                </div>

                {/* Option-based results (radio, checkbox, dropdown) */}
                {dq.optionCounts && dq.optionCounts.length > 0 && (
                  <div className={styles.resultsBarChart}>
                    {dq.optionCounts.map((opt) => {
                      const percentage =
                        dq.totalResponses > 0
                          ? Math.round((opt.count / dq.totalResponses) * 100)
                          : 0;

                      return (
                        <div key={opt.option} className={styles.resultsBarRow}>
                          <div className={styles.resultsBarLabel}>{opt.option}</div>
                          <div className={styles.resultsBarTrack}>
                            <div
                              className={styles.resultsBarFill}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className={styles.resultsBarValue}>
                            {opt.count} ({percentage}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Numeric results (range, number) */}
                {dq.numericStats && (
                  <div className={styles.resultsNumericStats}>
                    <div className={styles.resultsNumericItem}>
                      <span className={styles.resultsNumericLabel}>Min</span>
                      <span className={styles.resultsNumericValue}>{dq.numericStats.min}</span>
                    </div>
                    <div className={styles.resultsNumericItem}>
                      <span className={styles.resultsNumericLabel}>Max</span>
                      <span className={styles.resultsNumericValue}>{dq.numericStats.max}</span>
                    </div>
                    <div className={styles.resultsNumericItem}>
                      <span className={styles.resultsNumericLabel}>{t('average')}</span>
                      <span className={styles.resultsNumericValue}>{dq.numericStats.average}</span>
                    </div>
                  </div>
                )}

                {/* Text responses: just show count */}
                {['text', 'textarea'].includes(dq.type) && dq.totalResponses > 0 && (
                  <div className={styles.resultsTextCount}>
                    {dq.totalResponses} {t('responses')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Subscribers Section */}
      <div className={styles.resultsSection}>
        <h2 className={styles.resultsSectionTitle}>{t('emailSubscribers')}</h2>
        {subscribers && subscribers.count > 0 ? (
          <div className={styles.emailSubscribersContent}>
            <div className={styles.emailSubscribersHeader}>
              <span className={styles.emailSubscribersCount}>
                {subscribers.count} {t('subscribers')}
              </span>
              <button
                className={`${styles.copyButton} ${emailsCopied ? styles.copied : ''}`}
                onClick={handleCopyEmails}
              >
                {emailsCopied ? t('copied') : t('copyAllEmails')}
              </button>
            </div>
            <div className={styles.emailSubscribersList}>
              {subscribers.emails.join(', ')}
            </div>
          </div>
        ) : (
          <p className={styles.resultsEmpty}>{t('noEmailSubscribers')}</p>
        )}
      </div>
    </div>
  );
}
