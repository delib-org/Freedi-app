'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import styles from './DocumentView.module.scss';

interface ProgressBarProps {
  initialEvaluations: Record<string, number>;
  totalParagraphs: number;
}

export default function ProgressBar({
  initialEvaluations,
  totalParagraphs,
}: ProgressBarProps) {
  const { evaluations, userInteractions, initializeEvaluations } = useUIStore();

  // Initialize evaluations from server data on mount
  useEffect(() => {
    initializeEvaluations(initialEvaluations, totalParagraphs);
  }, [initialEvaluations, totalParagraphs, initializeEvaluations]);

  // Calculate progress from store (real-time updates)
  // Count paragraphs that have been "dealt with" (evaluated OR interacted)
  const dealtWithCount = useMemo(() => {
    const dealtWithSet = new Set<string>();

    // Add all evaluated paragraphs
    Object.keys(evaluations).forEach(id => dealtWithSet.add(id));

    // Add all interacted paragraphs
    userInteractions.forEach((id: string) => dealtWithSet.add(id));

    return dealtWithSet.size;
  }, [evaluations, userInteractions]);

  const progressPercent = totalParagraphs > 0
    ? Math.round((dealtWithCount / totalParagraphs) * 100)
    : 0;

  if (totalParagraphs === 0) return null;

  return (
    <div className={styles.progress}>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <span className={styles.progressText}>
        {dealtWithCount} / {totalParagraphs} reviewed ({progressPercent}%)
      </span>
    </div>
  );
}
