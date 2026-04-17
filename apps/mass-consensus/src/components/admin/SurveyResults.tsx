'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { Survey } from '@/types/survey';
import ExportModal from './ExportModal';
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

interface ParticipationStats {
  totalEntered: number;
  totalEvaluators: number;
  totalSolutionAdders: number;
  totalSolutions: number;
  totalNotEngaged: number;
}

interface ResultsData {
  questions: QuestionResult[];
  demographics: DemographicQuestionResult[];
  evaluatorDemographics: DemographicQuestionResult[];
  participation?: ParticipationStats;
}

interface SubscribersData {
  emails: string[];
  count: number;
  activeEmails?: string[];
  activeCount?: number;
  closedEmails?: string[];
  closedCount?: number;
}

type EmailGroupKey = 'active' | 'closed';

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
  const [emailsCopied, setEmailsCopied] = useState<EmailGroupKey | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

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

  const handleExport = async (includeTestData: boolean) => {
    const token = await refreshToken();
    if (!token) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));

      return;
    }

    const response = await fetch(
      `/api/surveys/${survey.surveyId}/export?includeTestData=${includeTestData}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error('Export failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-${survey.surveyId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleCopyEmails = async (group: EmailGroupKey, emails: string[]) => {
    if (emails.length === 0) return;

    const emailText = emails.join(', ');
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
    setEmailsCopied(group);
    setTimeout(() => setEmailsCopied((current) => (current === group ? null : current)), 2000);
  };

  const hasQuestions = results.questions.length > 0;
  const hasDemographics = results.demographics.length > 0;
  const hasEvaluatorDemographics = results.evaluatorDemographics?.length > 0;

  function renderDemographicCards(data: DemographicQuestionResult[], keyPrefix: string) {
    return (
      <div className={styles.resultsDemographicsList}>
        {data.map((dq) => (
          <div key={`${keyPrefix}-${dq.userQuestionId}`} className={styles.resultsDemographicCard}>
            <div className={styles.resultsDemographicHeader}>
              <span className={styles.resultsDemographicQuestion}>{dq.question}</span>
              <span className={styles.resultsDemographicType}>{dq.type}</span>
            </div>
            <div className={styles.resultsDemographicMeta}>
              {t('totalResponses')}: {dq.totalResponses}
            </div>

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

            {['text', 'textarea'].includes(dq.type) && dq.totalResponses > 0 && (
              <div className={styles.resultsTextCount}>
                {dq.totalResponses} {t('responses')}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  const participation = results.participation;

  return (
    <div className={styles.resultsContainer}>
      {/* Participation Stats + Download */}
      <div className={styles.resultsSection}>
        <div className={styles.resultsHeaderRow}>
          <h2 className={styles.resultsSectionTitle}>{t('participationStats')}</h2>
          <button
            type="button"
            className={styles.resultsDownloadButton}
            onClick={() => setShowExportModal(true)}
          >
            {t('downloadData')}
          </button>
        </div>
        <div className={styles.participationStatsGrid}>
          <ParticipationStatCard
            value={participation?.totalEntered ?? 0}
            label={t('entered')}
            tooltip={t('enteredTooltip')}
          />
          <ParticipationStatCard
            value={participation?.totalNotEngaged ?? 0}
            label={t('notEngaged')}
            tooltip={t('notEngagedTooltip')}
          />
          <ParticipationStatCard
            value={participation?.totalEvaluators ?? 0}
            label={t('evaluated')}
            tooltip={t('evaluatedTooltip')}
          />
          <ParticipationStatCard
            value={participation?.totalSolutionAdders ?? 0}
            label={t('addedSolutions')}
            tooltip={t('addedSolutionsTooltip')}
          />
          <ParticipationStatCard
            value={participation?.totalSolutions ?? 0}
            label={t('solutionsSubmitted')}
            tooltip={t('solutionsSubmittedTooltip')}
          />
        </div>
      </div>

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

      {/* All Respondents Demographics */}
      {hasDemographics && (
        <div className={styles.resultsSection}>
          <h2 className={styles.resultsSectionTitle}>{t('demographicResults')}</h2>
          {renderDemographicCards(results.demographics, 'all')}
        </div>
      )}

      {/* Evaluators-Only Demographics */}
      {hasEvaluatorDemographics && (
        <div className={styles.resultsSection}>
          <h2 className={styles.resultsSectionTitle}>{t('evaluatorDemographics')}</h2>
          {renderDemographicCards(results.evaluatorDemographics, 'eval')}
        </div>
      )}

      {/* Email Subscribers Section */}
      <div className={styles.resultsSection}>
        <h2 className={styles.resultsSectionTitle}>{t('emailSubscribers')}</h2>
        {subscribers && subscribers.count > 0 ? (
          <>
            <EmailGroup
              groupKey="active"
              title={t('subscribedDuringSurvey')}
              description={t('subscribedDuringSurveyDescription')}
              emails={subscribers.activeEmails ?? subscribers.emails}
              count={subscribers.activeCount ?? subscribers.count}
              copied={emailsCopied === 'active'}
              onCopy={handleCopyEmails}
              styles={styles}
              copiedLabel={t('copied')}
              copyLabel={t('copyAllEmails')}
              subscribersLabel={t('subscribers')}
              emptyLabel={t('noEmailSubscribers')}
            />
            <EmailGroup
              groupKey="closed"
              title={t('subscribedAfterClose')}
              description={t('subscribedAfterCloseDescription')}
              emails={subscribers.closedEmails ?? []}
              count={subscribers.closedCount ?? 0}
              copied={emailsCopied === 'closed'}
              onCopy={handleCopyEmails}
              styles={styles}
              copiedLabel={t('copied')}
              copyLabel={t('copyAllEmails')}
              subscribersLabel={t('subscribers')}
              emptyLabel={t('noPostCloseSubscribers')}
            />
          </>
        ) : (
          <p className={styles.resultsEmpty}>{t('noEmailSubscribers')}</p>
        )}
      </div>

      {showExportModal && (
        <ExportModal
          surveyId={survey.surveyId}
          surveyTitle={survey.title}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}
    </div>
  );
}

interface EmailGroupProps {
  groupKey: EmailGroupKey;
  title: string;
  description?: string;
  emails: string[];
  count: number;
  copied: boolean;
  onCopy: (group: EmailGroupKey, emails: string[]) => void;
  styles: Record<string, string>;
  copiedLabel: string;
  copyLabel: string;
  subscribersLabel: string;
  emptyLabel: string;
}

function EmailGroup({
  groupKey,
  title,
  description,
  emails,
  count,
  copied,
  onCopy,
  styles,
  copiedLabel,
  copyLabel,
  subscribersLabel,
  emptyLabel,
}: EmailGroupProps) {
  return (
    <div className={styles.emailSubscribersGroup}>
      <div className={styles.emailSubscribersGroupHeader}>
        <h3 className={styles.emailSubscribersGroupTitle}>{title}</h3>
        {description && (
          <p className={styles.emailSubscribersGroupDescription}>{description}</p>
        )}
      </div>

      {count > 0 ? (
        <div className={styles.emailSubscribersContent}>
          <div className={styles.emailSubscribersHeader}>
            <span className={styles.emailSubscribersCount}>
              {count} {subscribersLabel}
            </span>
            <button
              type="button"
              className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
              onClick={() => onCopy(groupKey, emails)}
            >
              {copied ? copiedLabel : copyLabel}
            </button>
          </div>
          <div className={styles.emailSubscribersList}>
            {emails.join(', ')}
          </div>
        </div>
      ) : (
        <p className={styles.resultsEmpty}>{emptyLabel}</p>
      )}
    </div>
  );
}

interface ParticipationStatCardProps {
  value: number;
  label: string;
  tooltip: string;
}

function ParticipationStatCard({ value, label, tooltip }: ParticipationStatCardProps) {
  return (
    <div className={styles.participationStatCard}>
      <span className={styles.participationStatNumber}>{value}</span>
      <span className={styles.participationStatLabel}>
        {label}
        <span
          className={styles.participationStatInfo}
          tabIndex={0}
          role="button"
          aria-label={tooltip}
        >
          ?
          <span className={styles.participationStatTooltip} role="tooltip">
            {tooltip}
          </span>
        </span>
      </span>
    </div>
  );
}
