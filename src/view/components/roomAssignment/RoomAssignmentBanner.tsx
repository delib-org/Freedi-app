import { FC, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { selectMyRoomAssignment } from '@/redux/roomAssignment/roomAssignmentSlice';
import { statementsSelector } from '@/redux/statements/statementsSlice';
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

	// Get current user ID - works for both registered and anonymous users
	const userId = useAppSelector((state: RootState) => state.creator.creator?.uid);

	// Get my room assignment from Redux
	const myAssignment = useSelector(selectMyRoomAssignment);

	// Get statements to find the topic name
	const statements = useSelector(statementsSelector);

	// Find the topic (option) statement for this assignment
	const topicStatement = myAssignment
		? statements.find((s) => s.statementId === myAssignment.statementId)
		: null;
	const topicName = topicStatement?.statement || t('your assigned topic');

	// Track previous assignment to detect new assignments
	const prevAssignmentRef = useRef<string | null>(null);
	const [showSnackbar, setShowSnackbar] = useState(false);
	const [hasShownInitialSnackbar, setHasShownInitialSnackbar] = useState(false);

	// Listen to my room assignment
	useEffect(() => {
		if (!userId) return;

		const unsubscribe = listenToMyRoomAssignment(statementId, userId, dispatch);

		return () => {
			unsubscribe();
		};
	}, [statementId, userId, dispatch]);

	// Show snackbar when receiving a room assignment (including initial load)
	useEffect(() => {
		if (myAssignment && prevAssignmentRef.current !== myAssignment.participantId) {
			// Show snackbar on initial load or new assignment
			if (!hasShownInitialSnackbar || prevAssignmentRef.current !== null) {
				setShowSnackbar(true);
				setHasShownInitialSnackbar(true);
			}
			prevAssignmentRef.current = myAssignment.participantId;
		}
	}, [myAssignment, hasShownInitialSnackbar]);

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
					<div className={styles.banner__title}>
						{t('Room')} {myAssignment.roomNumber}: {topicName}
					</div>
					<div className={styles.banner__subtitle}>
						{t('Join your designated room for the discussion')}
					</div>
				</div>
				<div className={styles.banner__roomNumber}>
					{myAssignment.roomNumber}
				</div>
			</div>

			<Snackbar
				message={`${t('Room')} ${myAssignment.roomNumber}: ${topicName}`}
				subMessage={t('Go to the topic card to join the discussion')}
				isVisible={showSnackbar}
				type="success"
				duration={7000}
				onClose={() => setShowSnackbar(false)}
			/>
		</>
	);
};

export default RoomAssignmentBanner;
