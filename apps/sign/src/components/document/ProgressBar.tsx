'use client';

import { useEffect } from 'react';
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
  const { approvals, initializeApprovals } = useUIStore();

  // Initialize approvals from server data on mount
  useEffect(() => {
    initializeApprovals(initialApprovals, totalParagraphs);
  }, [initialApprovals, totalParagraphs, initializeApprovals]);

  // Calculate progress from store (real-time updates)
  const reviewedCount = Object.keys(approvals).length;
  const progressPercent = totalParagraphs > 0
    ? Math.round((reviewedCount / totalParagraphs) * 100)
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
        {reviewedCount} / {totalParagraphs} reviewed ({progressPercent}%)
      </span>
    </div>
  );
}
