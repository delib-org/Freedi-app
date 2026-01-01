'use client';

import { Statement } from '@freedi/shared-types';
import EvaluationButtons from './EvaluationButtons';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
import InlineMarkdown from '../shared/InlineMarkdown';
import styles from './SolutionCard.module.css';

interface SolutionCardProps {
  solution: Statement;
  onEvaluate: (solutionId: string, score: number) => void;
  currentScore?: number | null;
}

/**
 * Solution card component
 * Displays solution title (bold) and description, with evaluation buttons
 */
export default function SolutionCard({
  solution,
  onEvaluate,
  currentScore,
}: SolutionCardProps) {
  const handleEvaluate = (score: number) => {
    onEvaluate(solution.statementId, score);
  };

  // Use statement as title, description if available
  const title = solution.statement;
  // For solutions without description, use the statement itself
  const description = getParagraphsText(solution.paragraphs) || solution.statement;

  // Only show description if it's different from title (avoid duplication)
  const showDescription = description && description !== title;

  const hasEvaluated = currentScore !== undefined && currentScore !== null;

  return (
    <div className={`${styles.card} ${hasEvaluated ? styles.evaluated : ''}`}>
      <div className={styles.content}>
        <h3 className={styles.title}>
          <InlineMarkdown text={title} />
        </h3>
        {showDescription && (
          <p className={styles.description}>
            <InlineMarkdown text={description} />
          </p>
        )}
      </div>

      <EvaluationButtons
        onEvaluate={handleEvaluate}
        currentScore={currentScore}
      />
    </div>
  );
}
