import React, { FC, useState } from 'react';
import styles from './Badges.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Tooltip } from '@/view/components/tooltip/Tooltip';
import { Room } from '@/types/roomAssignment';

interface Props {
	room: Room;
	isCurrentUser: boolean;
	onSelect?: (room: Room) => void;
}

const RoomBadge: FC<Props> = ({ room, isCurrentUser, onSelect }) => {
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

	const handleClick = () => {
		if (onSelect) {
			onSelect(room);
		}
	};

	const tooltipContent = isCurrentUser
		? t('You are in Room') + ` ${room.roomNumber}`
		: t('Room') + ` ${room.roomNumber}`;

	const badgeLabel = isCurrentUser
		? `${t('Room')} ${room.roomNumber} - ${t('YOU')}`
		: `${t('Room')} ${room.roomNumber}`;

	const badgeVariant = isCurrentUser ? 'room-current' : 'room-other';

	return (
		<Tooltip content={tooltipContent} position="top">
			<div
				className={`${styles.badge} ${styles[`badge--${badgeVariant}`]} ${
					isExpanded ? styles['badge--expanded'] : ''
				}`}
				aria-label={tooltipContent}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				onClick={handleClick}
				role={onSelect ? 'button' : undefined}
				tabIndex={onSelect ? 0 : undefined}
				onKeyDown={(e) => {
					if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
						handleClick();
					}
				}}
			>
				<span className={styles['badge__room-number']}>{room.roomNumber}</span>
				<span className={styles.badge__text}>{badgeLabel}</span>
			</div>
		</Tooltip>
	);
};

export default RoomBadge;
