'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { SignDemographicQuestion } from '@/types/demographics';
import { logError } from '@/lib/utils/errorHandling';
import styles from './DemographicResponses.module.scss';

interface UserResponse {
  odlUserId: string;
  answers: Record<string, string | string[] | undefined>;
}

interface DemographicResponsesProps {
  documentId: string;
}

export default function DemographicResponses({ documentId }: DemographicResponsesProps) {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<SignDemographicQuestion[]>([]);
  const [responses, setResponses] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResponses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/demographics/responses/${documentId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch responses');
      }

      const data = await response.json();
      setQuestions(data.questions || []);
      setResponses(data.responses || []);
    } catch (err) {
      logError(err, {
        operation: 'DemographicResponses.fetchResponses',
        documentId,
      });
      setError(t('Failed to load responses'));
    } finally {
      setLoading(false);
    }
  }, [documentId, t]);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  const formatAnswer = (answer: string | string[] | undefined): string => {
    if (!answer) return '-';
    if (Array.isArray(answer)) return answer.join(', ');
    return answer;
  };

  // Calculate stats for each question
  const getQuestionStats = (questionId: string) => {
    const answers = responses
      .map((r) => r.answers[questionId])
      .filter(Boolean);

    const total = answers.length;
    const answerCounts: Record<string, number> = {};

    answers.forEach((answer) => {
      if (Array.isArray(answer)) {
        answer.forEach((a) => {
          answerCounts[a] = (answerCounts[a] || 0) + 1;
        });
      } else if (answer) {
        answerCounts[answer] = (answerCounts[answer] || 0) + 1;
      }
    });

    return { total, answerCounts };
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>{t('Loading responses...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>{error}</p>
        <button className={styles.retryButton} onClick={fetchResponses}>
          {t('Retry')}
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyText}>
          {t('Demographics survey is not enabled for this document.')}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Summary Header */}
      <div className={styles.summaryHeader}>
        <h3 className={styles.summaryTitle}>{t('Survey Responses')}</h3>
        <div className={styles.summaryStats}>
          <span className={styles.statItem}>
            <strong>{responses.length}</strong> {t('responses')}
          </span>
          <span className={styles.statItem}>
            <strong>{questions.length}</strong> {t('questions')}
          </span>
        </div>
      </div>

      {/* Questions Summary with Stats */}
      <div className={styles.questionsSummary}>
        {questions.map((question, index) => {
          const stats = getQuestionStats(question.userQuestionId || '');
          const isChoiceQuestion = question.type === 'radio' || question.type === 'checkbox';

          return (
            <div key={question.userQuestionId || index} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <span className={styles.questionNumber}>Q{index + 1}</span>
                <h4 className={styles.questionText}>{question.question}</h4>
                <span className={styles.responseCount}>
                  {stats.total} {t('responses')}
                </span>
              </div>

              {isChoiceQuestion && question.options && question.options.length > 0 && (
                <div className={styles.optionStats}>
                  {question.options.map((option, optIndex) => {
                    const count = stats.answerCounts[option.option] || 0;
                    const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

                    return (
                      <div key={optIndex} className={styles.optionStat}>
                        <div className={styles.optionInfo}>
                          <span className={styles.optionLabel}>{option.option}</span>
                          <span className={styles.optionCount}>
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <div className={styles.optionBar}>
                          <div
                            className={styles.optionBarFill}
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: option.color || 'var(--btn-primary)',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Responses Table */}
      {responses.length > 0 && (
        <div className={styles.responsesTable}>
          <h3 className={styles.tableTitle}>{t('Individual Responses')}</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.userColumn}>{t('User')}</th>
                  {questions.map((q, i) => (
                    <th key={q.userQuestionId || i} className={styles.questionColumn}>
                      Q{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {responses.map((response, rIndex) => (
                  <tr key={response.odlUserId || rIndex}>
                    <td className={styles.userCell}>
                      {t('User')} {rIndex + 1}
                    </td>
                    {questions.map((q, qIndex) => (
                      <td key={q.userQuestionId || qIndex} className={styles.answerCell}>
                        {formatAnswer(response.answers[q.userQuestionId || ''])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {responses.length === 0 && (
        <div className={styles.noResponses}>
          <p>{t('No responses yet. Users will see the survey when they visit the document.')}</p>
        </div>
      )}
    </div>
  );
}
