import { createContext, FC, useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { listenToUserRoomAssignment } from '@/controllers/db/roomAssignment/getRoomAssignment';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { RoomParticipant } from '@freedi/shared-types';
import styles from './RoomBadge.module.scss';

/** Set by a list of answers: its one listener's result, so each badge need not listen. */
export const RoomAssignmentsContext = createContext<ReadonlyMap<string, RoomParticipant> | null>(
	null,
);

interface RoomBadgeProps {
	statementId: string;
}

const RoomBadge: FC<RoomBadgeProps> = ({ statementId }) => {
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);
	const fromList = useContext(RoomAssignmentsContext);
	const [ownAssignment, setOwnAssignment] = useState<RoomParticipant | null>(null);
	const hasList = fromList !== null;
	const roomAssignment = fromList ? (fromList.get(statementId) ?? null) : ownAssignment;

	// Listen to user's room assignment for this statement
	useEffect(() => {
		if (hasList || !creator?.uid || !statementId) return;

		const unsubscribe = listenToUserRoomAssignment(statementId, creator.uid, setOwnAssignment);

		return () => {
			unsubscribe();
		};
	}, [statementId, creator?.uid, hasList]);

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
			<span className={styles.roomBadge__text}>{roomLabel}</span>
		</div>
	);
};

export default RoomBadge;
