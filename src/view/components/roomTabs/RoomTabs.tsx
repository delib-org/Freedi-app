import React, { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Room, RoomParticipant } from '@/types/roomAssignment';
import styles from './RoomTabs.module.scss';

interface RoomTabsProps {
	rooms: Room[];
	currentUserRoomId?: string;
	participants?: RoomParticipant[];
	currentUserId?: string;
	onSelectRoom?: (room: Room) => void;
}

const RoomTabs: FC<RoomTabsProps> = ({
	rooms,
	currentUserRoomId,
	participants = [],
	currentUserId,
	onSelectRoom,
}) => {
	const { t } = useTranslation();

	// Default to the current user's room or the first room
	const defaultRoomId = currentUserRoomId || rooms[0]?.roomId;
	const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(defaultRoomId);

	const handleTabClick = (room: Room) => {
		setSelectedRoomId(room.roomId);
		if (onSelectRoom) {
			onSelectRoom(room);
		}
	};

	// Get participants for the selected room
	const selectedRoomParticipants = participants.filter(
		(p) => p.roomId === selectedRoomId
	);

	// Sort rooms by room number
	const sortedRooms = [...rooms].sort((a, b) => a.roomNumber - b.roomNumber);

	return (
		<div className={styles['room-tabs']}>
			<div className={styles['room-tabs__tabs-container']}>
				{sortedRooms.map((room) => {
					const isSelected = room.roomId === selectedRoomId;
					const isCurrentUserRoom = room.roomId === currentUserRoomId;
					const roomParticipantCount = participants.filter(
						(p) => p.roomId === room.roomId
					).length;

					return (
						<button
							key={room.roomId}
							type="button"
							className={`${styles['room-tabs__tab']} ${
								isSelected ? styles['room-tabs__tab--selected'] : ''
							} ${isCurrentUserRoom ? styles['room-tabs__tab--current-user'] : ''}`}
							onClick={() => handleTabClick(room)}
							aria-selected={isSelected}
							role="tab"
						>
							<span className={styles['room-tabs__tab-number']}>
								{room.roomNumber}
							</span>
							<span>{t('Room')} {room.roomNumber}</span>
							{isCurrentUserRoom && (
								<span className={styles['room-tabs__tab-you']}>{t('YOU')}</span>
							)}
							{roomParticipantCount > 0 && (
								<span className={styles['room-tabs__count']}>
									({roomParticipantCount})
								</span>
							)}
						</button>
					);
				})}
			</div>

			{selectedRoomId && selectedRoomParticipants.length > 0 && (
				<div className={styles['room-tabs__participants']}>
					{selectedRoomParticipants.map((participant) => {
						const isCurrentUser = participant.userId === currentUserId;

						return (
							<div
								key={participant.participantId}
								className={`${styles['room-tabs__participant']} ${
									isCurrentUser ? styles['room-tabs__participant--current'] : ''
								}`}
							>
								<span className={styles['room-tabs__participant-name']}>
									{participant.userName}
									{isCurrentUser && ` (${t('You')})`}
								</span>
							</div>
						);
					})}
				</div>
			)}

			{selectedRoomId && selectedRoomParticipants.length === 0 && (
				<div className={styles['room-tabs__empty']}>
					{t('No participants assigned yet')}
				</div>
			)}
		</div>
	);
};

export default RoomTabs;
