'use client';

import { EngagementLevel } from '@freedi/shared-types';
import { getLevelName } from '@freedi/engagement-core';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './LevelBadge.module.scss';

const LEVEL_COLORS: Record<EngagementLevel, string> = {
  [EngagementLevel.OBSERVER]: '#888888',
  [EngagementLevel.PARTICIPANT]: '#5f88e5',
  [EngagementLevel.CONTRIBUTOR]: '#4ecdc4',
  [EngagementLevel.ADVOCATE]: '#f5a623',
  [EngagementLevel.LEADER]: '#9b59b6',
};

interface LevelBadgeProps {
  level: EngagementLevel;
}

export default function LevelBadge({ level }: LevelBadgeProps) {
  const { t } = useTranslation();
  const color = LEVEL_COLORS[level];
  const name = getLevelName(level);

  return (
    <span
      className={styles.levelBadge}
      style={{ '--level-color': color } as React.CSSProperties}
      title={t(name)}
    >
      <span className={styles.dot} />
      <span className={styles.name}>{t(name)}</span>
    </span>
  );
}
