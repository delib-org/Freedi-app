'use client';

import { Statement } from 'delib-npm';
import EvaluationButtons from './EvaluationButtons';
import styles from './SolutionCard.module.css';

interface SolutionCardProps {
  solution: Statement;
  onEvaluate: (solutionId: string, score: number) => void;
  isEvaluated: boolean;
}

/**
 * Solution card component
 * Displays solution text and evaluation buttons
 */
export default function SolutionCard({
  solution,
  onEvaluate,
  isEvaluated,
}: SolutionCardProps) {
  const handleEvaluate = (score: number) => {
    onEvaluate(solution.statementId, score);
  };

  return (
    <div className={`${styles.card} ${isEvaluated ? styles.evaluated : ''}`}>
      <p className={styles.text}>{solution.statement}</p>

      <div className={styles.meta}>
        {solution.consensus !== undefined && (
          <span className={styles.consensus}>
            Score: {solution.consensus.toFixed(2)}
          </span>
        )}
        <span className={styles.date}>
          {new Date(solution.createdAt).toLocaleDateString('en-US')}
        </span>
      </div>

      <EvaluationButtons
        onEvaluate={handleEvaluate}
        disabled={isEvaluated}
      />

      {isEvaluated && (
        <div className={styles.evaluatedBadge}>
          ✓ Evaluated
        </div>
      )}
    </div>
  );
}
