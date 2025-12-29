'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './Survey.module.scss';

interface SurveyProgressProps {
  currentIndex: number;
  totalQuestions: number;
  completedIndices: number[];
}

/**
 * Progress bar showing connected dots for each question
 */
export default function SurveyProgressBar({
  currentIndex,
  totalQuestions,
  completedIndices,
}: SurveyProgressProps) {
  const { tWithParams } = useTranslation();

  const getStepStatus = (index: number): 'pending' | 'active' | 'completed' => {
    if (completedIndices.includes(index)) {
      return 'completed';
    }
    if (index === currentIndex) {
      return 'active';
    }
    return 'pending';
  };

  return (
    <div className={styles.progressContainer}>
      <div className={styles.progressBar}>
        {Array.from({ length: totalQuestions }).map((_, index) => {
          const status = getStepStatus(index);
          const isLast = index === totalQuestions - 1;

          return (
            <div key={index} className={styles.progressStep}>
              <div className={`${styles.progressDot} ${styles[status]}`}>
                {status === 'completed' ? (
                  <CheckIcon />
                ) : (
                  index + 1
                )}
              </div>
              {!isLast && (
                <div
                  className={`${styles.progressLine} ${
                    completedIndices.includes(index) ? styles.completed : ''
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.progressLabel}>
        {tWithParams('questionProgress', { current: currentIndex + 1, total: totalQuestions })}
      </div>
    </div>
  );
}

/**
 * Checkmark icon for completed steps
 */
function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
