// Room Assignment Controllers
export {
	// User-facing functions
	getUserRoomAssignment,
	listenToUserRoomAssignment,
	// Admin functions
	listenToRoomSettingsByStatement,
	listenToRoomSettingsByTopParent,
	listenToRoomsBySettingsId,
	listenToRoomsBySettingsIdMerge,
	listenToParticipantsBySettingsId,
	listenToParticipantsBySettingsIdMerge,
	getRoomAssignmentDataForAdmin,
	listenToMyRoomAssignmentWithDispatch,
	// Backwards compatibility aliases
	getMyRoomAssignmentFromDB,
	listenToMyRoomAssignment,
} from './getRoomAssignment';

export {
	createRoomAssignments,
	notifyRoomParticipants,
	deleteRoomAssignments,
} from './setRoomAssignment';
