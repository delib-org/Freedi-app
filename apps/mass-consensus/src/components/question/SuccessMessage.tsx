'use client';

import { useEffect } from 'react';
import { UI, TIME } from '@/constants/common';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './SuccessMessage.module.scss';

interface SuccessMessageProps {
  action: 'created' | 'evaluated' | 'merged';
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
  const isMerged = action === 'merged';

  const getIcon = () => {
    if (isNewSolution) return '✅';
    if (isMerged) return '🔀';

    return '🤝';
  };

  const getTitle = () => {
    if (isNewSolution) return t('Your solution added!');
    if (isMerged) return t('Your idea was merged!');

    return t('Great minds think alike!');
  };

  const getMessage = () => {
    if (isNewSolution) {
      return (
        <>
          {t('Thank you for contributing!')} 🎉
          <br />
          {t('Your idea is now part of the community discussion.')}
        </>
      );
    }
    if (isMerged) {
      return (
        <>
          {t('Your idea has been merged with a similar proposal.')}
          <br />
          {t('Together we build stronger consensus!')} ✨
        </>
      );
    }

    return (
      <>
        {t('Your vote has been added to an existing solution.')}
        <br />
        {t("Together we're stronger!")} ✨
      </>
    );
  };

  return (
    <div className={`${styles.overlay} ${isNewSolution ? styles.newSolution : isMerged ? styles.merged : styles.evaluated}`}>
      <div className={styles.card}>
        {/* Icon */}
        <div className={styles.iconContainer}>
          <div className={styles.icon}>
            {getIcon()}
          </div>
        </div>

        {/* Title */}
        <h2 className={styles.title}>
          {getTitle()}
        </h2>

        {/* Message */}
        <p className={styles.message}>
          {getMessage()}
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
