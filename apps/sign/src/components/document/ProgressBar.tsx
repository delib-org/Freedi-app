'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import styles from './DocumentView.module.scss';

interface ProgressBarProps {
  initialApprovals: Record<string, boolean>;
  totalParagraphs: number;
}

export default function ProgressBar({
  initialApprovals,
  totalParagraphs,
}: ProgressBarProps) {
  const { approvals, userInteractions, initializeApprovals } = useUIStore();

  // Initialize approvals from server data on mount
  useEffect(() => {
    initializeApprovals(initialApprovals, totalParagraphs);
  }, [initialApprovals, totalParagraphs, initializeApprovals]);

  // Calculate progress from store (real-time updates)
  // Count paragraphs that have been "dealt with" (approved, rejected, OR interacted)
  const dealtWithCount = useMemo(() => {
    const dealtWithSet = new Set<string>();

    // Add all approved/rejected paragraphs
    Object.keys(approvals).forEach(id => dealtWithSet.add(id));

    // Add all interacted paragraphs
    userInteractions.forEach((id: string) => dealtWithSet.add(id));

    return dealtWithSet.size;
  }, [approvals, userInteractions]);

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
