import React, { FC, useState } from 'react';
import styles from './Badges.module.scss';
import UsersIcon from '@/assets/icons/users20px.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Tooltip } from '@/view/components/tooltip/Tooltip';

interface Props {
	compact?: boolean;
}

const CommunityBadge: FC<Props> = () => {
	const [isExpanded, setIsExpanded] = useState(false);
	const { t } = useTranslation();

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
		<Tooltip content={t('Created by the community')} position="top">
			<div
				className={`${styles.badge} ${styles['badge--community']} ${
					isExpanded ? styles['badge--expanded'] : ''
				}`}
				aria-label={t('Community created statement')}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				<UsersIcon className={styles.badge__icon} />
				<span className={styles.badge__text}>{t('Community')}</span>
			</div>
		</Tooltip>
	);
};

export default CommunityBadge;
