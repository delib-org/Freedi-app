import { FC, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { selectMyRoomAssignment } from '@/redux/roomAssignment/roomAssignmentSlice';
import { listenToMyRoomAssignment } from '@/controllers/db/roomAssignment';
import RoomIcon from '@/assets/icons/homeIcon.svg?react';
import Snackbar from '@/view/components/snackbar/Snackbar';
import styles from './RoomAssignmentBanner.module.scss';
import { RootState } from '@/redux/store';

interface RoomAssignmentBannerProps {
	statementId: string;
}

const RoomAssignmentBanner: FC<RoomAssignmentBannerProps> = ({ statementId }) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();

	// Get current user ID
	const userId = useAppSelector((state: RootState) => state.creator.creator?.uid);

	// Get my room assignment from Redux
	const myAssignment = useSelector(selectMyRoomAssignment);

	// Track previous assignment to detect new assignments
	const prevAssignmentRef = useRef<string | null>(null);
	const [showSnackbar, setShowSnackbar] = useState(false);

	// Listen to my room assignment
	useEffect(() => {
		if (!userId) return;

		const unsubscribe = listenToMyRoomAssignment(statementId, userId, dispatch);

		return () => {
			unsubscribe();
		};
	}, [statementId, userId, dispatch]);

	// Show snackbar when receiving a new room assignment
	useEffect(() => {
		if (myAssignment && prevAssignmentRef.current !== myAssignment.participantId) {
			// Only show snackbar if this is a new assignment (not initial load)
			if (prevAssignmentRef.current !== null) {
				setShowSnackbar(true);
			}
			prevAssignmentRef.current = myAssignment.participantId;
		}
	}, [myAssignment]);

	// Don't render if no assignment or loading
	if (!myAssignment) {
		return null;
	}

	return (
		<>
			<div className={styles.banner}>
				<div className={styles.banner__icon}>
					<RoomIcon />
				</div>
				<div className={styles.banner__content}>
					<div className={styles.banner__title}>{t('You are assigned to a room')}</div>
					<div className={styles.banner__subtitle}>
						{t('Join your designated room for the discussion')}
					</div>
				</div>
				<div className={styles.banner__roomNumber}>{myAssignment.roomNumber}</div>
			</div>

			<Snackbar
				message={t('You have been assigned to Room {{roomNumber}}').replace(
					'{{roomNumber}}',
					String(myAssignment.roomNumber),
				)}
				subMessage={t('Check the banner above for details')}
				isVisible={showSnackbar}
				type="success"
				duration={5000}
				onClose={() => setShowSnackbar(false)}
			/>
		</>
	);
};

export default RoomAssignmentBanner;
