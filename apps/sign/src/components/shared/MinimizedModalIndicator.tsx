'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './MinimizedModalIndicator.module.scss';

interface MinimizedModalIndicatorProps {
  onClick: () => void;
}

export default function MinimizedModalIndicator({
  onClick,
}: MinimizedModalIndicatorProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className={styles.indicator}
      onClick={onClick}
      aria-label={t('Continue editing comment')}
    >
      <div className={styles.content}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.icon}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className={styles.text}>{t('Draft saved - click to continue editing')}</span>
      </div>
    </button>
  );
}
