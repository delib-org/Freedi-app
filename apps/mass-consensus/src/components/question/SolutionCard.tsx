'use client';

import { Statement } from '@freedi/shared-types';
import EvaluationButtons from './EvaluationButtons';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
import InlineMarkdown from '../shared/InlineMarkdown';
import ScoreBreakdown from './ScoreBreakdown';
import styles from './SolutionCard.module.css';

interface SolutionCardProps {
  solution: Statement;
  onEvaluate: (solutionId: string, score: number) => void;
  currentScore?: number | null;
}

/**
 * Solution card component
 * Displays solution title (bold) and description, with evaluation buttons.
 *
 * When the statement is a cluster (grouped suggestion) — `isCluster: true`
 * with `integratedOptions` — a small pill shows how many originals it
 * represents. Evaluations on the card aggregate with the originals'
 * evaluations server-side (see functions/condensation/aggregation.ts).
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

  const isCluster = solution.isCluster === true;

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
      {isCluster && <ScoreBreakdown clusterId={solution.statementId} />}
    </div>
  );
}
