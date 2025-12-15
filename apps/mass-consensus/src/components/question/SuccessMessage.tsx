'use client';

import { useEffect } from 'react';
import { UI, TIME } from '@/constants/common';
import { useTranslation } from '@freedi/shared-i18n/next';
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
  autoRedirectSeconds = UI.AUTO_REDIRECT_SECONDS,
}: SuccessMessageProps) {
  const { t, tWithParams } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, autoRedirectSeconds * TIME.SECOND);

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
          {isNewSolution ? t('Your solution added!') : t('Great minds think alike!')}
        </h2>

        {/* Message */}
        <p className={styles.message}>
          {isNewSolution ? (
            <>
              {t('Thank you for contributing!')} 🎉
              <br />
              {t('Your idea is now part of the community discussion.')}
            </>
          ) : (
            <>
              {t('Your vote has been added to an existing solution.')}
              <br />
              {t("Together we're stronger!")} ✨
            </>
          )}
        </p>

        {/* Vote Counter (for evaluated solutions) */}
        {!isNewSolution && voteCount !== undefined && (
          <div className={styles.voteCounter}>
            <span className={styles.voteNumber}>{voteCount}</span>
            <span className={styles.voteLabel}>
              {voteCount === 1 ? t('vote') : t('votes')}
            </span>
          </div>
        )}

        {/* Solution Text Preview */}
        <div className={styles.solutionPreview}>
          <p className={styles.solutionText}>&quot;{solutionText}&quot;</p>
        </div>

        {/* Manual Continue Button */}
        <button onClick={onComplete} className={styles.continueButton}>
          {t('View All Solutions')}
        </button>

        {/* Auto-redirect Notice */}
        <p className={styles.autoRedirect}>
          {tWithParams('Auto-redirecting in {{seconds}} seconds...', { seconds: autoRedirectSeconds })}
        </p>
      </div>
    </div>
  );
}
