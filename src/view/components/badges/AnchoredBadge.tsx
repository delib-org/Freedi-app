import React, { FC, useState } from 'react';
import styles from './Badges.module.scss';
import AnchorIcon from '@/assets/icons/anchor.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { Tooltip } from '@/view/components/tooltip/Tooltip';

interface Props {
	compact?: boolean;
	customIcon?: string;
	customDescription?: string;
	customLabel?: string;
}

const AnchoredBadge: FC<Props> = ({ customIcon, customDescription, customLabel }) => {
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

	const tooltipContent = customDescription || t('Selected by the moderator');
	const badgeLabel = customLabel || t('Anchored');

	return (
		<Tooltip content={tooltipContent} position="top">
			<div
				className={`${styles.badge} ${styles['badge--anchored']} ${
					isExpanded ? styles['badge--expanded'] : ''
				}`}
				aria-label={tooltipContent}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				{customIcon ? (
					<img
						src={customIcon}
						alt={badgeLabel}
						className={`${styles.badge__icon} ${styles['badge__icon--custom']}`}
					/>
				) : (
					<AnchorIcon className={styles.badge__icon} />
				)}
				<span className={styles.badge__text}>{badgeLabel}</span>
			</div>
		</Tooltip>
	);
};

export default AnchoredBadge;