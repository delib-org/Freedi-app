import React from 'react';
import styles from './EngagementNotificationCard.module.scss';
import { NotificationTriggerType } from '@freedi/shared-types';
import LevelBadge from '@/view/components/atomic/atoms/LevelBadge/LevelBadge';
import { EngagementLevel } from '@freedi/shared-types';

interface EngagementNotificationCardProps {
	triggerType: NotificationTriggerType;
	title: string;
	body: string;
	metadata?: Record<string, string>;
	createdAt: number;
}

const TRIGGER_ICONS: Partial<Record<NotificationTriggerType, string>> = {
	[NotificationTriggerType.CREDIT_EARNED]: '+',
	[NotificationTriggerType.LEVEL_UP]: 'L',
	[NotificationTriggerType.BADGE_EARNED]: 'B',
	[NotificationTriggerType.SOCIAL_PROOF]: 'S',
	[NotificationTriggerType.DAILY_DIGEST]: 'D',
	[NotificationTriggerType.WEEKLY_DIGEST]: 'W',
};

function formatTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return 'now';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);

	return `${days}d`;
}

const EngagementNotificationCard: React.FC<EngagementNotificationCardProps> = ({
	triggerType,
	title,
	body,
	metadata,
	createdAt,
}) => {
	const isLevelUp = triggerType === NotificationTriggerType.LEVEL_UP;
	const isCreditEarned = triggerType === NotificationTriggerType.CREDIT_EARNED;
	const icon = TRIGGER_ICONS[triggerType] ?? 'N';

	return (
		<article className={`${styles.card} ${isLevelUp ? styles.levelUp : ''}`} aria-label={title}>
			<div className={styles.iconWrapper} aria-hidden="true">
				{isLevelUp && metadata?.level ? (
					<LevelBadge level={Number(metadata.level) as EngagementLevel} size="small" iconOnly />
				) : (
					<span className={`${styles.icon} ${isCreditEarned ? styles.creditIcon : ''}`}>
						{icon}
					</span>
				)}
			</div>
			<div className={styles.content}>
				<strong className={styles.title}>{title}</strong>
				<span className={styles.body}>{body}</span>
			</div>
			<time className={styles.time}>{formatTime(createdAt)}</time>
		</article>
	);
};

export default EngagementNotificationCard;
