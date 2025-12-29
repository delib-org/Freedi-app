import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { RootState } from '../types';
import { RoomSettings, Room, RoomParticipant } from '@freedi/shared-types';

interface RoomAssignmentState {
	settings: RoomSettings[];
	rooms: Room[];
	participants: RoomParticipant[];
	myAssignment: RoomParticipant | null;
	isLoading: boolean;
	error: string | null;
}

const initialState: RoomAssignmentState = {
	settings: [],
	rooms: [],
	participants: [],
	myAssignment: null,
	isLoading: false,
	error: null,
};

export const roomAssignmentSlice = createSlice({
	name: 'roomAssignment',
	initialState,
	reducers: {
		// Settings reducers
		setRoomSettings: (state, action: PayloadAction<RoomSettings>) => {
			const newSettings = action.payload;
			const existingIndex = state.settings.findIndex(
				(s) => s.settingsId === newSettings.settingsId
			);
			if (existingIndex !== -1) {
				state.settings[existingIndex] = newSettings;
			} else {
				state.settings.push(newSettings);
			}
		},
		setRoomSettingsArray: (state, action: PayloadAction<RoomSettings[]>) => {
			state.settings = action.payload;
		},
		removeRoomSettings: (state, action: PayloadAction<string>) => {
			const settingsId = action.payload;
			state.settings = state.settings.filter((s) => s.settingsId !== settingsId);
			// Also remove related rooms and participants
			state.rooms = state.rooms.filter((r) => r.settingsId !== settingsId);
			state.participants = state.participants.filter((p) => p.settingsId !== settingsId);
		},
		clearRoomSettings: (state) => {
			state.settings = [];
			state.rooms = [];
			state.participants = [];
			state.myAssignment = null;
		},

		// Rooms reducers
		setRoom: (state, action: PayloadAction<Room>) => {
			const newRoom = action.payload;
			const existingIndex = state.rooms.findIndex((r) => r.roomId === newRoom.roomId);
			if (existingIndex !== -1) {
				state.rooms[existingIndex] = newRoom;
			} else {
				state.rooms.push(newRoom);
			}
		},
		setRoomsArray: (state, action: PayloadAction<Room[]>) => {
			state.rooms = action.payload;
		},
		// Merge rooms for a specific settingsId (keeps rooms from other settings)
		mergeRoomsBySettingsId: (state, action: PayloadAction<{ settingsId: string; rooms: Room[] }>) => {
			const { settingsId, rooms: newRooms } = action.payload;
			// Remove old rooms for this settingsId
			state.rooms = state.rooms.filter((r) => r.settingsId !== settingsId);
			// Add the new rooms
			state.rooms.push(...newRooms);
		},
		removeRoom: (state, action: PayloadAction<string>) => {
			const roomId = action.payload;
			state.rooms = state.rooms.filter((r) => r.roomId !== roomId);
		},

		// Participants reducers
		setParticipant: (state, action: PayloadAction<RoomParticipant>) => {
			const newParticipant = action.payload;
			const existingIndex = state.participants.findIndex(
				(p) => p.participantId === newParticipant.participantId
			);
			if (existingIndex !== -1) {
				state.participants[existingIndex] = newParticipant;
			} else {
				state.participants.push(newParticipant);
			}
		},
		setParticipantsArray: (state, action: PayloadAction<RoomParticipant[]>) => {
			state.participants = action.payload;
		},
		// Merge participants for a specific settingsId (keeps participants from other settings)
		mergeParticipantsBySettingsId: (state, action: PayloadAction<{ settingsId: string; participants: RoomParticipant[] }>) => {
			const { settingsId, participants: newParticipants } = action.payload;
			// Remove old participants for this settingsId
			state.participants = state.participants.filter((p) => p.settingsId !== settingsId);
			// Add the new participants
			state.participants.push(...newParticipants);
		},
		removeParticipant: (state, action: PayloadAction<string>) => {
			const participantId = action.payload;
			state.participants = state.participants.filter(
				(p) => p.participantId !== participantId
			);
		},

		// My assignment (current user's room)
		setMyAssignment: (state, action: PayloadAction<RoomParticipant | null>) => {
			state.myAssignment = action.payload;
		},

		// Loading state
		setLoading: (state, action: PayloadAction<boolean>) => {
			state.isLoading = action.payload;
		},

		// Error state
		setError: (state, action: PayloadAction<string | null>) => {
			state.error = action.payload;
		},
	},
});

// Base selectors
const getSettings = (state: RootState) => state.roomAssignment.settings;
const getRooms = (state: RootState) => state.roomAssignment.rooms;
const getParticipants = (state: RootState) => state.roomAssignment.participants;

// Export actions
export const {
	setRoomSettings,
	setRoomSettingsArray,
	removeRoomSettings,
	clearRoomSettings,
	setRoom,
	setRoomsArray,
	mergeRoomsBySettingsId,
	removeRoom,
	setParticipant,
	setParticipantsArray,
	mergeParticipantsBySettingsId,
	removeParticipant,
	setMyAssignment,
	setLoading,
	setError,
} = roomAssignmentSlice.actions;

// Selectors

/**
 * Select all room settings
 */
export const selectAllRoomSettings = (state: RootState) => state.roomAssignment.settings;

/**
 * Select active settings for a specific statement
 */
export const selectActiveSettingsByStatementId = (statementId: string) =>
	createSelector([getSettings], (settings) =>
		settings.find((s) => s.statementId === statementId && s.status === 'active')
	);

/**
 * Select all settings for a specific statement
 */
export const selectSettingsByStatementId = (statementId: string) =>
	createSelector([getSettings], (settings) =>
		settings.filter((s) => s.statementId === statementId)
	);

/**
 * Select rooms for a specific settings ID
 */
export const selectRoomsBySettingsId = (settingsId: string) =>
	createSelector([getRooms], (rooms) =>
		rooms.filter((r) => r.settingsId === settingsId).sort((a, b) => a.roomNumber - b.roomNumber)
	);

/**
 * Select rooms for a specific statement ID
 */
export const selectRoomsByStatementId = (statementId: string) =>
	createSelector([getRooms], (rooms) =>
		rooms.filter((r) => r.statementId === statementId).sort((a, b) => a.roomNumber - b.roomNumber)
	);

/**
 * Select participants for a specific settings ID
 */
export const selectParticipantsBySettingsId = (settingsId: string) =>
	createSelector([getParticipants], (participants) =>
		participants.filter((p) => p.settingsId === settingsId)
	);

/**
 * Select participants for a specific room ID
 */
export const selectParticipantsByRoomId = (roomId: string) =>
	createSelector([getParticipants], (participants) =>
		participants.filter((p) => p.roomId === roomId)
	);

/**
 * Select current user's room assignment for a statement
 */
export const selectMyRoomAssignment = (state: RootState) => state.roomAssignment.myAssignment;

/**
 * Select loading state
 */
export const selectIsLoading = (state: RootState) => state.roomAssignment.isLoading;

/**
 * Select error state
 */
export const selectError = (state: RootState) => state.roomAssignment.error;

/**
 * Select room count for a settings ID
 */
export const selectRoomCountBySettingsId = (settingsId: string) =>
	createSelector([getRooms], (rooms) =>
		rooms.filter((r) => r.settingsId === settingsId).length
	);

/**
 * Select participant count for a settings ID
 */
export const selectParticipantCountBySettingsId = (settingsId: string) =>
	createSelector([getParticipants], (participants) =>
		participants.filter((p) => p.settingsId === settingsId).length
	);

export default roomAssignmentSlice;
