import { FC, useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RoomParticipant, RoomSettings } from '@freedi/shared-types';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	selectAllRoomSettings,
	setRoomsArray,
	setParticipantsArray,
} from '@/redux/roomAssignment/roomAssignmentSlice';
import { RootState } from '@/redux/types';
import {
	listenToRoomSettingsByTopParent,
	listenToRoomsBySettingsIdMerge,
	listenToParticipantsBySettingsIdMerge,
} from '@/controllers/db/roomAssignment';
import { ChevronDown, ChevronUp, Users, Home, Tag } from 'lucide-react';
import { OptionWithMembers } from '@/controllers/db/joining/splitJoinedOption';
import styles from './OptionRooms.module.scss';

interface CreatedRoomsDisplayProps {
	statementId: string;
	options?: OptionWithMembers[];
}

const CreatedRoomsDisplay: FC<CreatedRoomsDisplayProps> = ({ statementId, options = [] }) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();

	// Create a map from option statementId to option title
	const optionTitleMap = useMemo(() => {
		const map = new Map<string, string>();
		options.forEach((opt) => map.set(opt.statementId, opt.statement));

		return map;
	}, [options]);

	const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

	// Get all room settings (for all options under this parent)
	const allSettings = useSelector(selectAllRoomSettings);

	// Filter to only ACTIVE settings for this parent
	// Group by option (statementId) and take only the most recent active setting per option
	const activeSettings = useMemo(() => {
		const filtered = allSettings.filter(
			(s) => s.topParentId === statementId && s.status === 'active',
		);

		// Debug: log what we're filtering
		if (filtered.length > 0) {
			console.info('[CreatedRoomsDisplay] Active settings found:', filtered.length);
			filtered.forEach((s) => {
				console.info(
					`  - settingsId: ${s.settingsId}, optionId: ${s.statementId}, createdAt: ${s.createdAt}, rooms: ${s.totalRooms}`,
				);
			});
		}

		const settingsMap = filtered.reduce((acc, setting) => {
			// Keep only the most recent setting per option (by statementId)
			const existing = acc.get(setting.statementId);
			if (!existing || setting.createdAt > existing.createdAt) {
				acc.set(setting.statementId, setting);
			}

			return acc;
		}, new Map<string, RoomSettings>());

		const result = Array.from(settingsMap.values());
		console.info('[CreatedRoomsDisplay] After dedup by option:', result.length, 'settings');

		return result;
	}, [allSettings, statementId]);

	const settingsIds = useMemo(() => activeSettings.map((s) => s.settingsId), [activeSettings]);

	// Get rooms and participants from Redux
	const allRooms = useSelector((state: RootState) => state.roomAssignment.rooms);
	const allParticipants = useSelector((state: RootState) => state.roomAssignment.participants);

	// Filter rooms and participants to only those belonging to our active settings
	const rooms = useMemo(
		() => allRooms.filter((r) => settingsIds.includes(r.settingsId)),
		[allRooms, settingsIds],
	);
	const participants = useMemo(
		() => allParticipants.filter((p) => settingsIds.includes(p.settingsId)),
		[allParticipants, settingsIds],
	);

	// Clear rooms when statementId changes
	useEffect(() => {
		// Clear old room data when the parent statement changes
		dispatch(setRoomsArray([]));
		dispatch(setParticipantsArray([]));
	}, [statementId, dispatch]);

	// Listen to room settings for all options under this parent
	useEffect(() => {
		const unsubscribeSettings = listenToRoomSettingsByTopParent(statementId, dispatch);

		return () => {
			unsubscribeSettings();
		};
	}, [statementId, dispatch]);

	// Listen to rooms and participants for each settings (using merge to accumulate)
	useEffect(() => {
		if (settingsIds.length === 0) return;

		const unsubscribers: Array<() => void> = [];

		for (const settId of settingsIds) {
			unsubscribers.push(listenToRoomsBySettingsIdMerge(settId, dispatch));
			unsubscribers.push(listenToParticipantsBySettingsIdMerge(settId, dispatch));
		}

		return () => {
			unsubscribers.forEach((unsub) => unsub());
		};
	}, [settingsIds.join(','), dispatch]);

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

	const toggleRoom = (roomId: string) => {
		setExpandedRooms((prev) => ({
			...prev,
			[roomId]: !prev[roomId],
		}));
	};

	if (rooms.length === 0) {
		return null;
	}

	return (
		<div className={styles.optionRooms__subsection}>
			<h3 className={styles.optionRooms__subsectionTitle}>{t('Created Rooms')}</h3>
			<p className={styles.optionRooms__subsectionDescription}>
				{rooms.length} {t('rooms')} {t('with')} {participants.length} {t('participants')}
			</p>

			<div className={styles.roomsDisplay}>
				{rooms
					.sort((a, b) => a.roomNumber - b.roomNumber)
					.map((room) => {
						const roomParticipants = participantsByRoom[room.roomId] || [];
						const isExpanded = expandedRooms[room.roomId];
						const topicTitle = optionTitleMap.get(room.statementId) || '';

						return (
							<div key={room.roomId} className={styles.roomsDisplay__room}>
								<button
									className={styles.roomsDisplay__roomHeader}
									onClick={() => toggleRoom(room.roomId)}
									type="button"
								>
									<div className={styles.roomsDisplay__roomInfo}>
										<Home size={18} />
										<span className={styles.roomsDisplay__roomName}>
											{room.roomName || `${t('Room')} ${room.roomNumber}`}
										</span>
										{topicTitle && (
											<span className={styles.roomsDisplay__topicBadge}>
												<Tag size={12} />
												{topicTitle}
											</span>
										)}
										<span className={styles.roomsDisplay__roomCount}>
											<Users size={14} />
											{roomParticipants.length}
										</span>
									</div>
									{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
								</button>

								{isExpanded && (
									<div className={styles.roomsDisplay__participants}>
										{roomParticipants.length === 0 ? (
											<p className={styles.roomsDisplay__emptyRoom}>
												{t('No participants assigned')}
											</p>
										) : (
											roomParticipants.map((participant) => (
												<div
													key={participant.participantId}
													className={styles.roomsDisplay__participant}
												>
													<span className={styles.roomsDisplay__participantName}>
														{participant.userName}
													</span>
													{participant.demographicTags.length > 0 && (
														<div className={styles.roomsDisplay__demographicTags}>
															{participant.demographicTags.map((tag, index) => (
																<span
																	key={`${tag.questionId}-${index}`}
																	className={styles.roomsDisplay__tag}
																	style={{
																		backgroundColor: tag.color || '#e0e0e0',
																		color: getContrastColor(tag.color || '#e0e0e0'),
																	}}
																	title={tag.questionText}
																>
																	{tag.answer}
																</span>
															))}
														</div>
													)}
												</div>
											))
										)}
									</div>
								)}
							</div>
						);
					})}
			</div>
		</div>
	);
};

/**
 * Get contrasting text color (black or white) based on background color
 */
function getContrastColor(hexColor: string): string {
	// Remove # if present
	const hex = hexColor.replace('#', '');

	// Convert to RGB
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	// Calculate luminance
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	// Return black for light colors, white for dark colors
	return luminance > 0.5 ? '#000000' : '#ffffff';
}

export default CreatedRoomsDisplay;
