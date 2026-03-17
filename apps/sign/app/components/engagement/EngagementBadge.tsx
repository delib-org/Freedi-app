'use client';

import { useEngagementStore } from '@/store/engagementStore';
import LevelBadge from './LevelBadge';
import styles from './EngagementBadge.module.scss';

interface EngagementBadgeProps {
	className?: string;
}

export default function EngagementBadge({ className }: EngagementBadgeProps) {
	const totalCredits = useEngagementStore((state) => state.totalCredits);
	const loading = useEngagementStore((state) => state.loading);
	const engagement = useEngagementStore((state) => state.engagement);

	if (loading || !engagement) {
		return null;
	}

	const classes = [styles.wrapper, className].filter(Boolean).join(' ');

	return (
		<div className={classes}>
			<LevelBadge />
			<span className={styles.credits}>{totalCredits} credits</span>
		</div>
	);
}
