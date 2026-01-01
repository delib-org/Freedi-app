import { Statement } from '@freedi/shared-types';
import AIFeedbackButton from './AIFeedbackButton';
import InlineMarkdown from '../shared/InlineMarkdown';
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
  if (solutions.length === 0) {
    return (
      <div className={styles.empty}>
        <h3>No solutions yet</h3>
        <p>
          {tab === 'mine'
            ? "You haven't submitted any solutions yet."
            : 'Be the first to submit a solution!'}
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
                  Score: {(solution.consensus || 0).toFixed(2)}
                </span>
                <span className={styles.date}>
                  {new Date(solution.createdAt).toLocaleDateString()}
                </span>
              </div>
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
