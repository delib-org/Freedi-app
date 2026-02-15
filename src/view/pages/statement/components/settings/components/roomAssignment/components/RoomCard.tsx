import { FC, useState } from 'react';
import { Room, RoomParticipant } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ParticipantChip from './ParticipantChip';
import RoomIcon from '@/assets/icons/homeIcon.svg?react';
import ArrowDownIcon from '@/assets/icons/arrow-down.svg?react';
import styles from '../RoomAssignment.module.scss';

interface RoomCardProps {
	room: Room;
	participants: RoomParticipant[];
}

const RoomCard: FC<RoomCardProps> = ({ room, participants }) => {
	const { t } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(false);

	return (
		<div className={styles.roomCard}>
			<button
				type="button"
				className={styles.roomCard__header}
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
			>
				<div className={styles.roomCard__title}>
					<RoomIcon />
					{room.roomName || `${t('Room')} ${room.roomNumber}`}
				</div>
				<span className={styles.roomCard__count}>
					{participants.length} {t('participants')}
				</span>
				<div
					className={`${styles.roomCard__expandIcon} ${isExpanded ? styles['roomCard__expandIcon--expanded'] : ''}`}
				>
					<ArrowDownIcon />
				</div>
			</button>

			{isExpanded && (
				<div className={styles.roomCard__participants}>
					{participants.map((participant) => (
						<ParticipantChip
							key={participant.participantId}
							participant={participant}
						/>
					))}
					{participants.length === 0 && (
						<p className={styles.roomCard__empty}>
							{t('No participants assigned')}
						</p>
					)}
				</div>
			)}
		</div>
	);
};

export default RoomCard;
