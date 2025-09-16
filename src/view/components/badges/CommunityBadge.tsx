import React, { FC } from 'react';
import styles from './Badges.module.scss';
import UsersIcon from '@/assets/icons/users20px.svg?react';

interface Props {
	compact?: boolean;
}

const CommunityBadge: FC<Props> = ({ compact = false }) => {
	return (
		<div
			className={`${styles.badge} ${styles['badge--community']} ${
				compact ? styles['badge--compact'] : ''
			}`}
			title="Created by the community"
			aria-label="Community created statement"
		>
			<UsersIcon className={styles.badge__icon} />
			{!compact && <span className={styles.badge__text}>Community</span>}
		</div>
	);
};

export default CommunityBadge;