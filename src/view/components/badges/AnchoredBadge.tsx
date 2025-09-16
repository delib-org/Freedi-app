import React, { FC, useState } from 'react';
import styles from './Badges.module.scss';
import AnchorIcon from '@/assets/icons/anchor.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { Tooltip } from '@/view/components/tooltip/Tooltip';

interface Props {
	compact?: boolean;
}

const AnchoredBadge: FC<Props> = () => {
	const [isExpanded, setIsExpanded] = useState(false);
	const { t } = useUserConfig();

	const handleMouseEnter = () => {
		// Only expand on desktop hover
		if (window.innerWidth > 768) {
			setIsExpanded(true);
		}
	};

	const handleMouseLeave = () => {
		setIsExpanded(false);
	};

	return (
		<Tooltip content={t('Selected by the moderator')} position="top">
			<div
				className={`${styles.badge} ${styles['badge--anchored']} ${
					isExpanded ? styles['badge--expanded'] : ''
				}`}
				aria-label={t('Anchored statement')}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				<AnchorIcon className={styles.badge__icon} />
				<span className={styles.badge__text}>{t('Anchored')}</span>
			</div>
		</Tooltip>
	);
};

export default AnchoredBadge;