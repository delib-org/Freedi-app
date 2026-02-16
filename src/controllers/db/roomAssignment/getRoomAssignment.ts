import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { FireStore } from '../config';
import { RoomParticipant, RoomSettings, Room } from '@freedi/shared-types';
import { AppDispatch } from '@/redux/store';
import {
	setRoomSettingsArray,
	setRoomsArray,
	setParticipantsArray,
	mergeRoomsBySettingsId,
	mergeParticipantsBySettingsId,
	setMyAssignment,
	setLoading,
} from '@/redux/roomAssignment/roomAssignmentSlice';
import { logError } from '@/utils/errorHandling';

/**
 * Get user's room assignment for a specific option/statement
 * @param statementId - The option statement ID
 * @param userId - The user's ID
 * @returns RoomParticipant or null if not assigned
 */
export async function getUserRoomAssignment(
	statementId: string,
	userId: string,
): Promise<RoomParticipant | null> {
	try {
		const participantsRef = collection(FireStore, 'roomParticipants');
		const q = query(
			participantsRef,
			where('statementId', '==', statementId),
			where('userId', '==', userId),
		);

		const snapshot = await getDocs(q);

		if (snapshot.empty) {
			return null;
		}

		// Return the first (and should be only) assignment
		const doc = snapshot.docs[0];

		return doc.data() as RoomParticipant;
	} catch (error) {
		console.error('Error fetching room assignment:', error);

		return null;
	}
}

/**
 * Listen to user's room assignment for a specific option/statement
 * @param statementId - The option statement ID
 * @param userId - The user's ID
 * @param callback - Callback when assignment changes
 * @returns Unsubscribe function
 */
export function listenToUserRoomAssignment(
	statementId: string,
	userId: string,
	callback: (assignment: RoomParticipant | null) => void,
): () => void {
	try {
		const participantsRef = collection(FireStore, 'roomParticipants');
		const q = query(
			participantsRef,
			where('statementId', '==', statementId),
			where('userId', '==', userId),
		);

		return onSnapshot(
			q,
			(snapshot) => {
				if (snapshot.empty) {
					callback(null);

					return;
				}

				const doc = snapshot.docs[0];
				callback(doc.data() as RoomParticipant);
			},
			(error) => {
				console.error('Error listening to room assignment:', error);
				callback(null);
			},
		);
	} catch (error) {
		console.error('Error setting up room assignment listener:', error);

		return () => {};
	}
}

/**
 * Alias for listenToUserRoomAssignment (for backwards compatibility)
 */
export const listenToMyRoomAssignment = listenToUserRoomAssignment;

/**
 * Alias for getUserRoomAssignment (for backwards compatibility)
 */
export const getMyRoomAssignmentFromDB = getUserRoomAssignment;

/**
 * Listen to room settings for a specific statement (with Redux dispatch)
 * @param statementId - The statement ID
 * @param dispatch - Redux dispatch function
 * @returns Unsubscribe function
 */
export function listenToRoomSettingsByStatement(
	statementId: string,
	dispatch: AppDispatch,
): () => void {
	try {
		const settingsRef = collection(FireStore, 'roomsSettings');
		const q = query(settingsRef, where('statementId', '==', statementId));

		return onSnapshot(
			q,
			(snapshot) => {
				const settings: RoomSettings[] = [];
				snapshot.forEach((doc) => {
					settings.push(doc.data() as RoomSettings);
				});
				dispatch(setRoomSettingsArray(settings));
			},
			(error) => {
				console.error('Error listening to room settings:', error);
				dispatch(setRoomSettingsArray([]));
			},
		);
	} catch (error) {
		console.error('Error setting up room settings listener:', error);

		return () => {};
	}
}

/**
 * Listen to room settings for all options under a parent statement (with Redux dispatch)
 * This queries by topParentId to find rooms for all options under the parent
 * @param topParentId - The top parent statement ID
 * @param dispatch - Redux dispatch function
 * @returns Unsubscribe function
 */
export function listenToRoomSettingsByTopParent(
	topParentId: string,
	dispatch: AppDispatch,
): () => void {
	try {
		const settingsRef = collection(FireStore, 'roomsSettings');
		const q = query(settingsRef, where('topParentId', '==', topParentId));

		return onSnapshot(
			q,
			(snapshot) => {
				const settings: RoomSettings[] = [];
				snapshot.forEach((doc) => {
					settings.push(doc.data() as RoomSettings);
				});
				dispatch(setRoomSettingsArray(settings));
			},
			(error) => {
				console.error('Error listening to room settings by top parent:', error);
				dispatch(setRoomSettingsArray([]));
			},
		);
	} catch (error) {
		console.error('Error setting up room settings listener:', error);

		return () => {};
	}
}

/**
 * Listen to rooms for a specific settings ID (with Redux dispatch)
 * Note: This REPLACES all rooms in Redux. Use listenToRoomsBySettingsIdMerge for multi-settings scenarios.
 * @param settingsId - The settings ID
 * @param dispatch - Redux dispatch function
 * @returns Unsubscribe function
 */
export function listenToRoomsBySettingsId(settingsId: string, dispatch: AppDispatch): () => void {
	try {
		const roomsRef = collection(FireStore, 'rooms');
		const q = query(roomsRef, where('settingsId', '==', settingsId));

		return onSnapshot(
			q,
			(snapshot) => {
				const rooms: Room[] = [];
				snapshot.forEach((doc) => {
					rooms.push(doc.data() as Room);
				});
				// Sort by room number
				rooms.sort((a, b) => a.roomNumber - b.roomNumber);
				dispatch(setRoomsArray(rooms));
			},
			(error) => {
				console.error('Error listening to rooms:', error);
				dispatch(setRoomsArray([]));
			},
		);
	} catch (error) {
		console.error('Error setting up rooms listener:', error);

		return () => {};
	}
}

/**
 * Listen to rooms for a specific settings ID and MERGE with existing rooms
 * Use this when loading rooms from multiple settings simultaneously
 * @param settingsId - The settings ID
 * @param dispatch - Redux dispatch function
 * @returns Unsubscribe function
 */
export function listenToRoomsBySettingsIdMerge(
	settingsId: string,
	dispatch: AppDispatch,
): () => void {
	try {
		const roomsRef = collection(FireStore, 'rooms');
		const q = query(roomsRef, where('settingsId', '==', settingsId));

		return onSnapshot(
			q,
			(snapshot) => {
				const rooms: Room[] = [];
				snapshot.forEach((doc) => {
					rooms.push(doc.data() as Room);
				});
				// Sort by room number
				rooms.sort((a, b) => a.roomNumber - b.roomNumber);
				dispatch(mergeRoomsBySettingsId({ settingsId, rooms }));
			},
			(error) => {
				console.error('Error listening to rooms:', error);
				dispatch(mergeRoomsBySettingsId({ settingsId, rooms: [] }));
			},
		);
	} catch (error) {
		console.error('Error setting up rooms listener:', error);

		return () => {};
	}
}

/**
 * Listen to participants for a specific settings ID (with Redux dispatch)
 * Note: This REPLACES all participants in Redux. Use listenToParticipantsBySettingsIdMerge for multi-settings scenarios.
 * @param settingsId - The settings ID
 * @param dispatch - Redux dispatch function
 * @returns Unsubscribe function
 */
export function listenToParticipantsBySettingsId(
	settingsId: string,
	dispatch: AppDispatch,
): () => void {
	try {
		const participantsRef = collection(FireStore, 'roomParticipants');
		const q = query(participantsRef, where('settingsId', '==', settingsId));

		return onSnapshot(
			q,
			(snapshot) => {
				const participants: RoomParticipant[] = [];
				snapshot.forEach((doc) => {
					participants.push(doc.data() as RoomParticipant);
				});
				dispatch(setParticipantsArray(participants));
			},
			(error) => {
				console.error('Error listening to participants:', error);
				dispatch(setParticipantsArray([]));
			},
		);
	} catch (error) {
		console.error('Error setting up participants listener:', error);

		return () => {};
	}
}

/**
 * Listen to participants for a specific settings ID and MERGE with existing participants
 * Use this when loading participants from multiple settings simultaneously
 * @param settingsId - The settings ID
 * @param dispatch - Redux dispatch function
 * @returns Unsubscribe function
 */
export function listenToParticipantsBySettingsIdMerge(
	settingsId: string,
	dispatch: AppDispatch,
): () => void {
	try {
		const participantsRef = collection(FireStore, 'roomParticipants');
		const q = query(participantsRef, where('settingsId', '==', settingsId));

		return onSnapshot(
			q,
			(snapshot) => {
				const participants: RoomParticipant[] = [];
				snapshot.forEach((doc) => {
					participants.push(doc.data() as RoomParticipant);
				});
				dispatch(mergeParticipantsBySettingsId({ settingsId, participants }));
			},
			(error) => {
				console.error('Error listening to participants:', error);
				dispatch(mergeParticipantsBySettingsId({ settingsId, participants: [] }));
			},
		);
	} catch (error) {
		console.error('Error setting up participants listener:', error);

		return () => {};
	}
}

/**
 * Get all room assignment data for admin view
 * Fetches settings, rooms, and participants for a statement
 * @param statementId - The statement ID
 * @param dispatch - Redux dispatch function
 */
export async function getRoomAssignmentDataForAdmin(
	statementId: string,
	dispatch: AppDispatch,
): Promise<void> {
	try {
		dispatch(setLoading(true));

		// Fetch room settings for the statement
		const settingsRef = collection(FireStore, 'roomsSettings');
		const settingsQuery = query(settingsRef, where('statementId', '==', statementId));
		const settingsSnapshot = await getDocs(settingsQuery);
		const settings: RoomSettings[] = [];
		settingsSnapshot.forEach((doc) => {
			settings.push(doc.data() as RoomSettings);
		});
		dispatch(setRoomSettingsArray(settings));

		// If we have settings, fetch rooms and participants
		if (settings.length > 0) {
			const activeSettings = settings.find((s) => s.status === 'active');
			const settingsId = activeSettings?.settingsId || settings[0].settingsId;

			// Fetch rooms
			const roomsRef = collection(FireStore, 'rooms');
			const roomsQuery = query(roomsRef, where('settingsId', '==', settingsId));
			const roomsSnapshot = await getDocs(roomsQuery);
			const rooms: Room[] = [];
			roomsSnapshot.forEach((doc) => {
				rooms.push(doc.data() as Room);
			});
			rooms.sort((a, b) => a.roomNumber - b.roomNumber);
			dispatch(setRoomsArray(rooms));

			// Fetch participants
			const participantsRef = collection(FireStore, 'roomParticipants');
			const participantsQuery = query(participantsRef, where('settingsId', '==', settingsId));
			const participantsSnapshot = await getDocs(participantsQuery);
			const participants: RoomParticipant[] = [];
			participantsSnapshot.forEach((doc) => {
				participants.push(doc.data() as RoomParticipant);
			});
			dispatch(setParticipantsArray(participants));
		} else {
			dispatch(setRoomsArray([]));
			dispatch(setParticipantsArray([]));
		}

		dispatch(setLoading(false));
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.getRoomAssignmentDataForAdmin',
			statementId,
		});
		dispatch(setLoading(false));
	}
}

/**
 * Set up listeners for current user's room assignment
 * @param statementId - The statement ID
 * @param userId - The user's ID
 * @param dispatch - Redux dispatch function
 * @returns Unsubscribe function
 */
export function listenToMyRoomAssignmentWithDispatch(
	statementId: string,
	userId: string,
	dispatch: AppDispatch,
): () => void {
	return listenToUserRoomAssignment(statementId, userId, (assignment) => {
		dispatch(setMyAssignment(assignment));
	});
}
