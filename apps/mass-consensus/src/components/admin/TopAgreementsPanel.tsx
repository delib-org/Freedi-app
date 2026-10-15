'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { authedFetch } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';
import { TOP_AGREEMENTS } from '@/constants/common';
import { QuestionTopAgreements, formatConsensusPercent } from '@/lib/utils/topAgreements';
import styles from './TopAgreementsPanel.module.scss';

interface TopAgreementsPanelProps {
  surveyId: string;
}

interface TopAgreementsResponse {
  questions: QuestionTopAgreements[];
}

/**
 * Admin-only panel: the highest-consensus options of each survey question,
 * so admins never need to leave MC to see what the group agrees on.
 */
export default function TopAgreementsPanel({ surveyId }: TopAgreementsPanelProps) {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<QuestionTopAgreements[]>([]);
  const [visibleByQuestion, setVisibleByQuestion] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      const response = await authedFetch(`/api/surveys/${surveyId}/top-agreements`);

      if (!response.ok) {
        throw new Error(`Top agreements request failed: ${response.status}`);
      }

      const data: TopAgreementsResponse = await response.json();
      setQuestions(data.questions);
    } catch (error) {
      logError(error, {
        operation: 'TopAgreementsPanel.load',
        metadata: { surveyId },
      });
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    load();
  }, [load]);

  const showMore = (questionId: string): void => {
    setVisibleByQuestion((prev) => ({
      ...prev,
      [questionId]: (prev[questionId] ?? TOP_AGREEMENTS.INITIAL_VISIBLE) + TOP_AGREEMENTS.PAGE_SIZE,
    }));
  };

  return (
    <div className={styles['top-agreements']}>
      <div className={styles['top-agreements__header']}>
        <h2 className={styles['top-agreements__title']}>{t('topAgreements')}</h2>
        <button
          type="button"
          className={styles['top-agreements__refresh']}
          onClick={load}
          disabled={isLoading}
        >
          {t('topAgreementsRefresh')}
        </button>
      </div>

      {isLoading && questions.length === 0 && (
        <p className={styles['top-agreements__message']} role="status">
          {t('loading')}
        </p>
      )}

      {hasError && (
        <p className={styles['top-agreements__message']} role="alert">
          {t('topAgreementsLoadError')}
        </p>
      )}

      {!hasError && !isLoading && questions.length === 0 && (
        <p className={styles['top-agreements__message']}>{t('topAgreementsEmpty')}</p>
      )}

      {questions.map((question) => {
        const visible = visibleByQuestion[question.statementId] ?? TOP_AGREEMENTS.INITIAL_VISIBLE;
        const shown = question.options.slice(0, visible);

        return (
          <section key={question.statementId} className={styles['top-agreements__question']}>
            <h3 className={styles['top-agreements__question-title']}>{question.statement}</h3>

            {question.options.length === 0 ? (
              <p className={styles['top-agreements__message']}>{t('topAgreementsNoOptions')}</p>
            ) : (
              <ol className={styles['top-agreements__list']}>
                {shown.map((option, index) => (
                  <li key={option.statementId} className={styles['top-agreements__row']}>
                    <span className={styles['top-agreements__rank']}>{index + 1}</span>
                    <span className={styles['top-agreements__text']}>{option.statement}</span>
                    <span className={styles['top-agreements__score']}>
                      {formatConsensusPercent(option.consensus)}%
                    </span>
                    <span className={styles['top-agreements__evaluators']}>
                      {option.numberOfEvaluators} {t('evaluators')}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {question.options.length > shown.length && (
              <button
                type="button"
                className={styles['top-agreements__more']}
                onClick={() => showMore(question.statementId)}
              >
                {t('topAgreementsShowMore')}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
