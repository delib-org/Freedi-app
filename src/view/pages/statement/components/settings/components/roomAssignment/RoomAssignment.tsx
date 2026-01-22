import { FC, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Statement, User } from '@freedi/shared-types';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import SectionTitle from '../sectionTitle/SectionTitle';
import RoomAssignmentConfig from './components/RoomAssignmentConfig';
import RoomsList from './components/RoomsList';
import styles from './RoomAssignment.module.scss';
import {
	selectActiveSettingsByStatementId,
	selectRoomsBySettingsId,
	selectParticipantsBySettingsId,
	selectIsLoading,
	selectError,
} from '@/redux/roomAssignment/roomAssignmentSlice';
import {
	listenToRoomSettingsByStatement,
	listenToRoomsBySettingsId,
	listenToParticipantsBySettingsId,
	getRoomAssignmentDataForAdmin,
} from '@/controllers/db/roomAssignment';
import Loader from '@/view/components/loaders/Loader';
import { RootState } from '@/redux/store';

interface RoomAssignmentProps {
	statement: Statement;
}

const RoomAssignment: FC<RoomAssignmentProps> = ({ statement }) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();

	const [viewMode, setViewMode] = useState<'config' | 'results'>('config');

	// Get current user
	const user = useAppSelector((state: RootState) => state.creator.creator) as User | null;

	// Get room assignment data from Redux
	const activeSettings = useSelector(
		selectActiveSettingsByStatementId(statement.statementId)
	);
	const settingsId = activeSettings?.settingsId || '';
	const rooms = useSelector(selectRoomsBySettingsId(settingsId));
	const participants = useSelector(selectParticipantsBySettingsId(settingsId));
	const isLoading = useSelector(selectIsLoading);
	const error = useSelector(selectError);

	// Listen to room settings for this statement
	useEffect(() => {
		const unsubscribeSettings = listenToRoomSettingsByStatement(
			statement.statementId,
			dispatch
		);

		return () => {
			unsubscribeSettings();
		};
	}, [statement.statementId, dispatch]);

	// Listen to rooms and participants when settings are loaded
	useEffect(() => {
		if (!settingsId) return;

		const unsubscribeRooms = listenToRoomsBySettingsId(settingsId, dispatch);
		const unsubscribeParticipants = listenToParticipantsBySettingsId(settingsId, dispatch);

		return () => {
			unsubscribeRooms();
			unsubscribeParticipants();
		};
	}, [settingsId, dispatch]);

	// Switch to results view when settings exist and rooms are loaded
	useEffect(() => {
		if (activeSettings && rooms.length > 0) {
			setViewMode('results');
		} else {
			setViewMode('config');
		}
	}, [activeSettings, rooms.length]);

	const handleCreateSuccess = () => {
		// Refresh data after creating assignments
		getRoomAssignmentDataForAdmin(statement.statementId, dispatch);
	};

	const handleReassign = () => {
		setViewMode('config');
	};

	if (!user) {
		return null;
	}

	return (
		<div className={styles.roomAssignment}>
			<SectionTitle title={t('Breakout Rooms')} />

			<div className={styles.roomAssignment__content}>
				{isLoading ? (
					<div className="center">
						<Loader />
					</div>
				) : error ? (
					<div className="error-message">{error}</div>
				) : viewMode === 'config' ? (
					<RoomAssignmentConfig
						statement={statement}
						user={user}
						existingSettings={activeSettings}
						onCreateSuccess={handleCreateSuccess}
					/>
				) : (
					<RoomsList
						settings={activeSettings!}
						rooms={rooms}
						participants={participants}
						onReassign={handleReassign}
					/>
				)}
			</div>
		</div>
	);
};

export default RoomAssignment;
