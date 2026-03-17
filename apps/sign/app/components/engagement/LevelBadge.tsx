'use client';

import { EngagementLevel } from '@freedi/shared-types';
import { getLevelName } from '@freedi/engagement-core';
import { useEngagementStore } from '@/store/engagementStore';
import styles from './LevelBadge.module.scss';

const LEVEL_STYLE_MAP: Record<EngagementLevel, string> = {
	[EngagementLevel.OBSERVER]: styles.observer,
	[EngagementLevel.PARTICIPANT]: styles.participant,
	[EngagementLevel.CONTRIBUTOR]: styles.contributor,
	[EngagementLevel.ADVOCATE]: styles.advocate,
	[EngagementLevel.LEADER]: styles.leader,
};

interface LevelBadgeProps {
	className?: string;
}

export default function LevelBadge({ className }: LevelBadgeProps) {
	const level = useEngagementStore((state) => state.level);
	const loading = useEngagementStore((state) => state.loading);

	if (loading) {
		return null;
	}

	const levelName = getLevelName(level);
	const levelClassName = LEVEL_STYLE_MAP[level] ?? styles.observer;

	const classes = [styles.badge, levelClassName, className]
		.filter(Boolean)
		.join(' ');

	return (
		<span className={classes} aria-label={`Engagement level: ${levelName}`}>
			{levelName}
		</span>
	);
}
