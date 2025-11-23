'use client';

import styles from './AchievementBadge.module.scss';

export type BadgeType =
  | 'early-contributor'
  | 'thoughtful-evaluator'
  | 'solution-creator'
  | 'consensus-participant';

interface BadgeConfig {
  icon: string;
  label: string;
  color: string;
  description: string;
}

const BADGE_CONFIG: Record<BadgeType, BadgeConfig> = {
  'early-contributor': {
    icon: '🌟',
    label: 'Early Bird',
    color: '#FFD700',
    description: 'Among the first 50 participants',
  },
  'thoughtful-evaluator': {
    icon: '🧠',
    label: 'Deep Thinker',
    color: '#9C27B0',
    description: 'Evaluated 5+ solutions',
  },
  'solution-creator': {
    icon: '💡',
    label: 'Innovator',
    color: '#FF9800',
    description: 'Submitted your own solution',
  },
  'consensus-participant': {
    icon: '🤝',
    label: 'Team Player',
    color: '#4CAF50',
    description: 'Completed the full consensus flow',
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
  const config = BADGE_CONFIG[type];

  return (
    <div
      className={styles.badge}
      style={{ '--badge-color': config.color } as React.CSSProperties}
      title={config.description}
    >
      <span className={styles.icon}>{config.icon}</span>
      <span className={styles.label}>{config.label}</span>
      {showDescription && (
        <span className={styles.description}>{config.description}</span>
      )}
    </div>
  );
}
