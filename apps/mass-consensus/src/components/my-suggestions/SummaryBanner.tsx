'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { MySuggestionsStats } from '@/types/mySuggestions';
import styles from './MySuggestionsPage.module.scss';

interface SummaryBannerProps {
  stats: MySuggestionsStats;
}

export default function SummaryBanner({ stats }: SummaryBannerProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.summaryBanner}>
      <div className={styles.statItem}>
        <span className={styles.statValue}>{stats.totalSuggestions}</span>
        <span className={styles.statLabel}>{t('suggestionsCount')}</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statValue}>{stats.totalComments}</span>
        <span className={styles.statLabel}>{t('commentsCount')}</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statValue}>{stats.averageScore}%</span>
        <span className={styles.statLabel}>{t('averageScore')}</span>
      </div>
    </div>
  );
}
