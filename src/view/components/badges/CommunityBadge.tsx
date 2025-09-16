import React, { FC, useState } from 'react';
import styles from './Badges.module.scss';
import UsersIcon from '@/assets/icons/users20px.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	compact?: boolean;
}

const CommunityBadge: FC<Props> = ({ compact = false }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const { t } = useUserConfig();

	return (
		<div
			className={`${styles.badge} ${styles['badge--community']} ${
				isExpanded ? styles['badge--expanded'] : ''
			}`}
			title={t('Created by the community')}
			aria-label={t('Community created statement')}
			onMouseEnter={() => setIsExpanded(true)}
			onMouseLeave={() => setIsExpanded(false)}
			onTouchStart={() => setIsExpanded(true)}
			onTouchEnd={() => setIsExpanded(false)}
		>
			<UsersIcon className={styles.badge__icon} />
			<span className={styles.badge__text}>{t('Community')}</span>
		</div>
	);
};

export default CommunityBadge;