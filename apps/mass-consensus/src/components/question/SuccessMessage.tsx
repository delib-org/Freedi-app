'use client';

import { useEffect } from 'react';
import styles from './SuccessMessage.module.scss';

interface SuccessMessageProps {
  action: 'created' | 'evaluated';
  solutionText: string;
  voteCount?: number;
  onComplete: () => void;
  autoRedirectSeconds?: number;
}

export default function SuccessMessage({
  action,
  solutionText,
  voteCount,
  onComplete,
  autoRedirectSeconds = 3,
}: SuccessMessageProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, autoRedirectSeconds * 1000);

    return () => clearTimeout(timer);
  }, [onComplete, autoRedirectSeconds]);

  const isNewSolution = action === 'created';

  return (
    <div className={`${styles.overlay} ${isNewSolution ? styles.newSolution : styles.evaluated}`}>
      <div className={styles.card}>
        {/* Icon */}
        <div className={styles.iconContainer}>
          <div className={styles.icon}>
            {isNewSolution ? '✅' : '🤝'}
          </div>
        </div>

        {/* Title */}
        <h2 className={styles.title}>
          {isNewSolution ? 'Your solution added!' : 'Great minds think alike!'}
        </h2>

        {/* Message */}
        <p className={styles.message}>
          {isNewSolution ? (
            <>
              Thank you for contributing! 🎉
              <br />
              Your idea is now part of the community discussion.
            </>
          ) : (
            <>
              Your vote has been added to an existing solution.
              <br />
              Together we're stronger! ✨
            </>
          )}
        </p>

        {/* Vote Counter (for evaluated solutions) */}
        {!isNewSolution && voteCount !== undefined && (
          <div className={styles.voteCounter}>
            <span className={styles.voteNumber}>{voteCount}</span>
            <span className={styles.voteLabel}>
              {voteCount === 1 ? 'vote' : 'votes'}
            </span>
          </div>
        )}

        {/* Solution Text Preview */}
        <div className={styles.solutionPreview}>
          <p className={styles.solutionText}>&quot;{solutionText}&quot;</p>
        </div>

        {/* Manual Continue Button */}
        <button onClick={onComplete} className={styles.continueButton}>
          View All Solutions
        </button>

        {/* Auto-redirect Notice */}
        <p className={styles.autoRedirect}>
          Auto-redirecting in {autoRedirectSeconds} seconds...
        </p>
      </div>
    </div>
  );
}
