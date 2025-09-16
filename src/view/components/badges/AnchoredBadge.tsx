import React, { FC } from 'react';
import styles from './Badges.module.scss';
import AnchorIcon from '@/assets/icons/anchor.svg?react';

interface Props {
	compact?: boolean;
}

const AnchoredBadge: FC<Props> = ({ compact = false }) => {
	return (
		<div
			className={`${styles.badge} ${styles['badge--anchored']} ${
				compact ? styles['badge--compact'] : ''
			}`}
			title="Selected by the moderator"
			aria-label="Anchored statement"
		>
			<AnchorIcon className={styles.badge__icon} />
			{!compact && <span className={styles.badge__text}>Anchored</span>}
		</div>
	);
};

export default AnchoredBadge;