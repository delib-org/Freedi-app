'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { useEngagement } from '@/hooks/useEngagement';
import LevelBadge from './LevelBadge';
import styles from './EngagementSummary.module.scss';

interface EngagementSummaryProps {
  userId: string | null;
}

export default function EngagementSummary({ userId }: EngagementSummaryProps) {
  const { t } = useTranslation();
  const { level, totalCredits, currentStreak, loading } = useEngagement(userId);

  if (loading || !userId) {
    return null;
  }

  return (
    <div className={styles.engagementSummary}>
      <LevelBadge level={level} />

      <span className={styles.divider} />

      <div className={styles.stat}>
        <span className={styles.statIcon}>
          <CreditIcon />
        </span>
        <span className={styles.statValue}>{totalCredits}</span>
        <span className={styles.statLabel}>{t('credits')}</span>
      </div>

      {currentStreak > 0 && (
        <>
          <span className={styles.divider} />
          <div className={styles.stat}>
            <span className={styles.statIcon}>
              <StreakIcon />
            </span>
            <span className={styles.statValue}>{currentStreak}</span>
            <span className={styles.statLabel}>{t('day streak')}</span>
          </div>
        </>
      )}
    </div>
  );
}

function CreditIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#5f88e5"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 0 1 0 4H8" />
      <path d="M12 18V6" />
    </svg>
  );
}

function StreakIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f5a623"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2c.5 2.5 2 4 4 5.5C18 9 19.5 12 19.5 14.5c0 4.14-3.36 7.5-7.5 7.5S4.5 18.64 4.5 14.5C4.5 12 6 9 8 7.5c2-1.5 3.5-3 4-5.5z" />
    </svg>
  );
}
