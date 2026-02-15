'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './AchievementBadge.module.scss';

export type BadgeType =
  | 'early-contributor'
  | 'thoughtful-evaluator'
  | 'solution-creator'
  | 'consensus-participant';

interface BadgeConfig {
  icon: string;
  labelKey: string;
  color: string;
  descriptionKey: string;
}

const BADGE_CONFIG: Record<BadgeType, BadgeConfig> = {
  'early-contributor': {
    icon: '🌟',
    labelKey: 'Early Bird',
    color: '#FFD700',
    descriptionKey: 'Among the first 50 participants',
  },
  'thoughtful-evaluator': {
    icon: '🧠',
    labelKey: 'Deep Thinker',
    color: '#9C27B0',
    descriptionKey: 'Evaluated 5+ solutions',
  },
  'solution-creator': {
    icon: '💡',
    labelKey: 'Innovator',
    color: '#FF9800',
    descriptionKey: 'Submitted your own solution',
  },
  'consensus-participant': {
    icon: '🤝',
    labelKey: 'Team Player',
    color: '#4CAF50',
    descriptionKey: 'Completed the full consensus flow',
  },
};

interface AchievementBadgeProps {
  type: BadgeType;
  showDescription?: boolean;
}

export default function AchievementBadge({
  type,
  showDescription = false,
}: AchievementBadgeProps) {
  const { t } = useTranslation();
  const config = BADGE_CONFIG[type];

  return (
    <div
      className={styles.badge}
      style={{ '--badge-color': config.color } as React.CSSProperties}
      title={t(config.descriptionKey)}
    >
      <span className={styles.icon}>{config.icon}</span>
      <span className={styles.label}>{t(config.labelKey)}</span>
      {showDescription && (
        <span className={styles.description}>{t(config.descriptionKey)}</span>
      )}
    </div>
  );
}
