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
 * Displays solution title (bold) and description, with evaluation buttons
 */
export default function SolutionCard({
  solution,
  onEvaluate,
  isEvaluated,
}: SolutionCardProps) {
  const handleEvaluate = (score: number) => {
    onEvaluate(solution.statementId, score);
  };

  // Use statement as title, description if available
  const title = solution.statement;
  // For solutions without description, use the statement itself
  const description = solution.description || solution.statement;

  // Only show description if it's different from title (avoid duplication)
  const showDescription = description && description !== title;

  return (
    <div className={`${styles.card} ${isEvaluated ? styles.evaluated : ''}`}>
      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>
        {showDescription && (
          <p className={styles.description}>{description}</p>
        )}
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
