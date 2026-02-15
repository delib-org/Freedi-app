'use client';

import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import AIFeedbackButton from './AIFeedbackButton';
import InlineMarkdown from '../shared/InlineMarkdown';
import CommentsList from './CommentsList';
import styles from './ResultsList.module.css';

interface ResultsListProps {
  solutions: Statement[];
  tab: 'all' | 'mine';
  userId?: string;
  questionId: string;
}

/**
 * Server Component - Results list
 * Displays sorted solutions
 */
export default function ResultsList({
  solutions,
  tab,
  userId,
  questionId,
}: ResultsListProps) {
  const { t } = useTranslation();

  if (solutions.length === 0) {
    return (
      <div className={styles.empty}>
        <h3>{t('No solutions yet heading')}</h3>
        <p>
          {tab === 'mine'
            ? t("You haven't submitted any solutions yet.")
            : t('Be the first to submit a solution!')}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {solutions.map((solution, index) => (
          <div key={solution.statementId} className={styles.item}>
            <div className={styles.rank}>#{index + 1}</div>
            <div className={styles.content}>
              <p className={styles.text}>
                <InlineMarkdown text={solution.statement} />
              </p>
              <div className={styles.meta}>
                <span className={styles.consensus}>
                  {t('Score:')} {(solution.consensus || 0).toFixed(2)}
                </span>
                <span className={styles.date}>
                  {new Date(solution.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Comments - auth check handled inside CommentsList */}
              <CommentsList statementId={solution.statementId} />
            </div>
          </div>
        ))}
      </div>

      {/* AI Feedback button for "My Solutions" tab */}
      {tab === 'mine' && userId && solutions.length > 0 && (
        <div className={styles.aiFeedback}>
          <AIFeedbackButton
            questionId={questionId}
            userId={userId}
          />
        </div>
      )}
    </div>
  );
}
