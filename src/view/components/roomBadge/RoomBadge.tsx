import { FC, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { listenToUserRoomAssignment } from '@/controllers/db/roomAssignment/getRoomAssignment';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { RoomParticipant } from '@freedi/shared-types';
import styles from './RoomBadge.module.scss';

interface RoomBadgeProps {
	statementId: string;
}

const RoomBadge: FC<RoomBadgeProps> = ({ statementId }) => {
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);
	const [roomAssignment, setRoomAssignment] = useState<RoomParticipant | null>(null);

	// Listen to user's room assignment for this statement
	useEffect(() => {
		if (!creator?.uid || !statementId) return;

		const unsubscribe = listenToUserRoomAssignment(
			statementId,
			creator.uid,
			setRoomAssignment
		);

		return () => {
			unsubscribe();
		};
	}, [statementId, creator?.uid]);

	// Don't render if user has no room assignment
	if (!roomAssignment) {
		return null;
	}

	const roomLabel = t('Room') + ' #' + roomAssignment.roomNumber;

	return (
		<div
			className={styles.roomBadge}
			title={t('You are assigned to this room')}
			aria-label={roomLabel}
		>
			<span className={styles.roomBadge__text}>
				{roomLabel}
			</span>
		</div>
	);
};

export default RoomBadge;
