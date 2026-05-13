'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './EvaluationProgress.module.css';

interface EvaluationProgressProps {
  evaluatedCount: number;
  totalCount: number;
}

/**
 * Mini inline progress bar showing evaluation progress within a batch
 */
export default function EvaluationProgress({
  evaluatedCount,
  totalCount,
}: EvaluationProgressProps) {
  const { tWithParams } = useTranslation();

  if (totalCount === 0) return null;

  const percentage = Math.min(100, Math.round((evaluatedCount / totalCount) * 100));

  return (
    <div className={styles.progressContainer} role="progressbar" aria-valuenow={evaluatedCount} aria-valuemin={0} aria-valuemax={totalCount}>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={styles.progressLabel}>
        {tWithParams('optionsRated', {
          evaluated: evaluatedCount,
          total: totalCount,
        })}
      </span>
    </div>
  );
}
