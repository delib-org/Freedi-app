import React, { FC, useState } from 'react';
import styles from './Badges.module.scss';
import AnchorIcon from '@/assets/icons/anchor.svg?react';

interface Props {
	compact?: boolean;
}

const AnchoredBadge: FC<Props> = ({ compact = false }) => {
	const [isExpanded, setIsExpanded] = useState(false);

	return (
		<div
			className={`${styles.badge} ${styles['badge--anchored']} ${
				isExpanded ? styles['badge--expanded'] : ''
			}`}
			title="Selected by the moderator"
			aria-label="Anchored statement"
			onMouseEnter={() => setIsExpanded(true)}
			onMouseLeave={() => setIsExpanded(false)}
			onTouchStart={() => setIsExpanded(true)}
			onTouchEnd={() => setIsExpanded(false)}
		>
			<AnchorIcon className={styles.badge__icon} />
			<span className={styles.badge__text}>Anchored</span>
		</div>
	);
};

export default AnchoredBadge;