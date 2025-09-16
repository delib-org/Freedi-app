import React, { FC, useState } from 'react';
import styles from './Badges.module.scss';
import AnchorIcon from '@/assets/icons/anchor.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	compact?: boolean;
}

const AnchoredBadge: FC<Props> = ({ compact = false }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const { t } = useUserConfig();

	return (
		<div
			className={`${styles.badge} ${styles['badge--anchored']} ${
				isExpanded ? styles['badge--expanded'] : ''
			}`}
			title={t('Selected by the moderator')}
			aria-label={t('Anchored statement')}
			onMouseEnter={() => setIsExpanded(true)}
			onMouseLeave={() => setIsExpanded(false)}
			onTouchStart={() => setIsExpanded(true)}
			onTouchEnd={() => setIsExpanded(false)}
		>
			<AnchorIcon className={styles.badge__icon} />
			<span className={styles.badge__text}>{t('Anchored')}</span>
		</div>
	);
};

export default AnchoredBadge;