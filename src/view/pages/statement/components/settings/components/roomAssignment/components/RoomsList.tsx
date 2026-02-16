import { FC, useState } from 'react';
import { RoomSettings, Room, RoomParticipant } from '@freedi/shared-types';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { notifyRoomParticipants, deleteRoomAssignments } from '@/controllers/db/roomAssignment';
import RoomCard from './RoomCard';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Snackbar from '@/view/components/snackbar/Snackbar';
import styles from '../RoomAssignment.module.scss';

interface RoomsListProps {
	settings: RoomSettings;
	rooms: Room[];
	participants: RoomParticipant[];
	onReassign: () => void;
}

const RoomsList: FC<RoomsListProps> = ({ settings, rooms, participants, onReassign }) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();

	const [isNotifying, setIsNotifying] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [snackbar, setSnackbar] = useState<{
		visible: boolean;
		message: string;
		type: 'success' | 'error' | 'info';
	}>({ visible: false, message: '', type: 'info' });

	// Group participants by room
	const participantsByRoom = participants.reduce(
		(acc, participant) => {
			if (!acc[participant.roomId]) {
				acc[participant.roomId] = [];
			}
			acc[participant.roomId].push(participant);

			return acc;
		},
		{} as Record<string, RoomParticipant[]>,
	);

	const handleNotify = async () => {
		setIsNotifying(true);
		try {
			const result = await notifyRoomParticipants(settings.settingsId, dispatch);
			if (result?.success) {
				setSnackbar({
					visible: true,
					message: t('Notifications sent to {{count}} participants').replace(
						'{{count}}',
						String(result.notified),
					),
					type: 'success',
				});
			} else if (result?.message) {
				setSnackbar({
					visible: true,
					message: result.message,
					type: 'info',
				});
			}
		} catch {
			setSnackbar({
				visible: true,
				message: t('Failed to send notifications'),
				type: 'error',
			});
		} finally {
			setIsNotifying(false);
		}
	};

	const handleDelete = async () => {
		setShowDeleteConfirm(false);
		setIsDeleting(true);
		try {
			await deleteRoomAssignments(settings.settingsId, dispatch);
		} finally {
			setIsDeleting(false);
		}
	};

	const notifiedCount = participants.filter((p) => p.notified).length;
	const allNotified = notifiedCount === participants.length && participants.length > 0;

	return (
		<div className={styles.roomsList}>
			{/* Header with stats and actions */}
			<div className={styles.roomsList__header}>
				<div className={styles.roomsList__stats}>
					<span>
						{t('Rooms')}: <strong>{rooms.length}</strong>
					</span>
					<span>
						{t('Participants')}: <strong>{participants.length}</strong>
					</span>
					{settings.notificationSent && (
						<span>
							{t('Notified')}:{' '}
							<strong>
								{notifiedCount}/{participants.length}
							</strong>
						</span>
					)}
				</div>

				<div className={styles.roomsList__actions}>
					<Button
						text={isNotifying ? t('Sending...') : allNotified ? t('All Notified') : t('Notify All')}
						buttonType={ButtonType.PRIMARY}
						onClick={handleNotify}
						disabled={isNotifying || allNotified}
					/>
					<Button text={t('Reassign')} buttonType={ButtonType.SECONDARY} onClick={onReassign} />
					<Button
						text={isDeleting ? t('Deleting...') : t('Delete')}
						buttonType={ButtonType.SECONDARY}
						onClick={() => setShowDeleteConfirm(true)}
						disabled={isDeleting}
					/>
				</div>
			</div>

			{/* Room Cards Grid */}
			<div className={styles.roomsList__grid}>
				{rooms.map((room) => (
					<RoomCard
						key={room.roomId}
						room={room}
						participants={participantsByRoom[room.roomId] || []}
					/>
				))}
			</div>

			{/* Delete Confirmation Modal */}
			{showDeleteConfirm && (
				<div className={styles.confirmModal}>
					<div className={styles.confirmModal__content}>
						<h3 className={styles.confirmModal__title}>{t('Delete Room Assignments?')}</h3>
						<p className={styles.confirmModal__message}>
							{t(
								'This will permanently delete all room assignments. This action cannot be undone.',
							)}
						</p>
						<div className={styles.confirmModal__actions}>
							<Button
								text={t('Cancel')}
								buttonType={ButtonType.SECONDARY}
								onClick={() => setShowDeleteConfirm(false)}
							/>
							<Button text={t('Delete')} buttonType={ButtonType.PRIMARY} onClick={handleDelete} />
						</div>
					</div>
				</div>
			)}

			{/* Snackbar for notifications */}
			<Snackbar
				message={snackbar.message}
				isVisible={snackbar.visible}
				type={snackbar.type}
				onClose={() => setSnackbar({ ...snackbar, visible: false })}
			/>
		</div>
	);
};

export default RoomsList;
