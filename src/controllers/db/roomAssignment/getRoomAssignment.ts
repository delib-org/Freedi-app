import {
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	where,
	Unsubscribe,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { AppDispatch } from '@/redux/store';
import {
	Collections,
	RoomSettings,
	RoomSettingsSchema,
	Room,
	RoomSchema,
	RoomParticipant,
	RoomParticipantSchema,
} from 'delib-npm';
import { parse } from 'valibot';
import {
	setRoomSettings,
	setRoomSettingsArray,
	setRoom,
	setRoomsArray,
	setParticipant,
	setParticipantsArray,
	setMyAssignment,
	setLoading,
	setError,
} from '@/redux/roomAssignment/roomAssignmentSlice';
import { logError } from '@/utils/errorHandling';

/**
 * Helper to extract a meaningful error message from Firebase errors
 * Firebase errors are often objects that don't serialize well
 */
function getFirebaseErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'object' && error !== null) {
		// Firebase errors often have a 'code' and 'message' property
		const firebaseError = error as Record<string, unknown>;

		// Try to extract code and message
		const code = firebaseError.code as string | undefined;
		const message = firebaseError.message as string | undefined;

		if (message) {
			return code ? `${code}: ${message}` : message;
		}

		// Try to stringify, but handle circular references
		try {
			const str = JSON.stringify(error, null, 2);
			if (str && str !== '{}') {
				return str;
			}
		} catch {
			// Circular reference or other JSON error
		}

		// Last resort: try to get keys and values
		const keys = Object.keys(firebaseError);
		if (keys.length > 0) {
			return `Firebase error with keys: ${keys.join(', ')}`;
		}

		return 'Unknown Firebase error (empty object)';
	}

	return String(error);
}

/**
 * Listen to room settings for a specific statement
 */
export function listenToRoomSettingsByStatement(
	statementId: string,
	dispatch: AppDispatch
): Unsubscribe {
	try {
		dispatch(setLoading(true));

		const settingsRef = collection(FireStore, Collections.roomsSettings);
		const q = query(
			settingsRef,
			where('statementId', '==', statementId),
			where('status', '==', 'active')
		);

		return onSnapshot(
			q,
			(snapshot) => {
				const settings: RoomSettings[] = [];
				snapshot.docChanges().forEach((change) => {
					try {
						const data = change.doc.data();
						// Ensure roomSize is at least 2 to pass validation
						if (data.roomSize && data.roomSize < 2) {
							data.roomSize = 2;
						}
						const parsedSettings = parse(RoomSettingsSchema, data);

						if (change.type === 'added' || change.type === 'modified') {
							settings.push(parsedSettings);
							dispatch(setRoomSettings(parsedSettings));
						}
					} catch (parseError) {
						logError(parseError, {
							operation: 'roomAssignment.listenToRoomSettings.parse',
							statementId,
							metadata: { docId: change.doc.id },
						});
					}
				});

				if (snapshot.docChanges().length === 0 || snapshot.metadata.hasPendingWrites === false) {
					dispatch(setLoading(false));
				}
			},
			(error) => {
				const errorMessage = getFirebaseErrorMessage(error);
				logError(new Error(errorMessage), {
					operation: 'roomAssignment.listenToRoomSettings',
					statementId,
				});
				dispatch(setError('Failed to load room settings'));
				dispatch(setLoading(false));
			}
		);
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.listenToRoomSettings.setup',
			statementId,
		});
		dispatch(setError('Failed to setup room settings listener'));
		dispatch(setLoading(false));

		return () => {};
	}
}

/**
 * Listen to rooms for a specific settings ID
 */
export function listenToRoomsBySettingsId(
	settingsId: string,
	dispatch: AppDispatch
): Unsubscribe {
	try {
		const roomsRef = collection(FireStore, Collections.rooms);
		const q = query(roomsRef, where('settingsId', '==', settingsId));

		return onSnapshot(
			q,
			(snapshot) => {
				const rooms: Room[] = [];
				snapshot.docChanges().forEach((change) => {
					try {
						const data = change.doc.data();
						const parsedRoom = parse(RoomSchema, data);

						if (change.type === 'added' || change.type === 'modified') {
							rooms.push(parsedRoom);
							dispatch(setRoom(parsedRoom));
						}
					} catch (parseError) {
						logError(parseError, {
							operation: 'roomAssignment.listenToRooms.parse',
							metadata: { settingsId, docId: change.doc.id },
						});
					}
				});
			},
			(error) => {
				const errorMessage = getFirebaseErrorMessage(error);
				logError(new Error(errorMessage), {
					operation: 'roomAssignment.listenToRooms',
					metadata: { settingsId },
				});
				dispatch(setError('Failed to load rooms'));
			}
		);
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.listenToRooms.setup',
			metadata: { settingsId },
		});

		return () => {};
	}
}

/**
 * Listen to participants for a specific settings ID
 */
export function listenToParticipantsBySettingsId(
	settingsId: string,
	dispatch: AppDispatch
): Unsubscribe {
	try {
		const participantsRef = collection(FireStore, Collections.roomParticipants);
		const q = query(participantsRef, where('settingsId', '==', settingsId));

		return onSnapshot(
			q,
			(snapshot) => {
				const participants: RoomParticipant[] = [];
				snapshot.docChanges().forEach((change) => {
					try {
						const data = change.doc.data();
						const parsedParticipant = parse(RoomParticipantSchema, data);

						if (change.type === 'added' || change.type === 'modified') {
							participants.push(parsedParticipant);
							dispatch(setParticipant(parsedParticipant));
						}
					} catch (parseError) {
						logError(parseError, {
							operation: 'roomAssignment.listenToParticipants.parse',
							metadata: { settingsId, docId: change.doc.id },
						});
					}
				});
			},
			(error) => {
				const errorMessage = getFirebaseErrorMessage(error);
				console.info('Room participant listener error:', errorMessage);
				logError(new Error(errorMessage), {
					operation: 'roomAssignment.listenToParticipants',
					metadata: { settingsId },
				});
				dispatch(setError('Failed to load participants'));
			}
		);
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.listenToParticipants.setup',
			metadata: { settingsId },
		});

		return () => {};
	}
}

/**
 * Get current user's room assignment for a statement
 */
export async function getMyRoomAssignmentFromDB(
	statementId: string,
	userId: string,
	dispatch: AppDispatch
): Promise<RoomParticipant | null> {
	try {
		dispatch(setLoading(true));

		// First, get the active settings for this statement
		const settingsRef = collection(FireStore, Collections.roomsSettings);
		const settingsQuery = query(
			settingsRef,
			where('statementId', '==', statementId),
			where('status', '==', 'active')
		);

		const settingsSnapshot = await getDocs(settingsQuery);
		if (settingsSnapshot.empty) {
			dispatch(setMyAssignment(null));
			dispatch(setLoading(false));

			return null;
		}

		const settingsDoc = settingsSnapshot.docs[0];
		const settingsId = settingsDoc.id;

		// Get participant document using composite ID
		const participantId = `${settingsId}--${userId}`;
		const participantRef = doc(FireStore, Collections.roomParticipants, participantId);
		const participantDoc = await getDoc(participantRef);

		if (!participantDoc.exists()) {
			dispatch(setMyAssignment(null));
			dispatch(setLoading(false));

			return null;
		}

		const data = participantDoc.data();
		const parsedParticipant = parse(RoomParticipantSchema, data);
		dispatch(setMyAssignment(parsedParticipant));
		dispatch(setLoading(false));

		return parsedParticipant;
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.getMyRoomAssignment',
			statementId,
			userId,
		});
		dispatch(setError('Failed to get your room assignment'));
		dispatch(setLoading(false));

		return null;
	}
}

/**
 * Listen to current user's room assignment
 */
export function listenToMyRoomAssignment(
	statementId: string,
	userId: string,
	dispatch: AppDispatch
): Unsubscribe {
	try {
		// First we need to find the active settings ID
		const settingsRef = collection(FireStore, Collections.roomsSettings);
		const settingsQuery = query(
			settingsRef,
			where('statementId', '==', statementId),
			where('status', '==', 'active')
		);

		// This is a nested listener - first listen to settings, then to participant
		let participantUnsubscribe: Unsubscribe | null = null;

		const settingsUnsubscribe = onSnapshot(
			settingsQuery,
			(settingsSnapshot) => {
				// Clean up previous participant listener
				if (participantUnsubscribe) {
					participantUnsubscribe();
					participantUnsubscribe = null;
				}

				if (settingsSnapshot.empty) {
					dispatch(setMyAssignment(null));

					return;
				}

				const settingsDoc = settingsSnapshot.docs[0];
				const settingsId = settingsDoc.id;
				const participantId = `${settingsId}--${userId}`;

				const participantRef = doc(FireStore, Collections.roomParticipants, participantId);
				participantUnsubscribe = onSnapshot(
					participantRef,
					(participantDoc) => {
						if (!participantDoc.exists()) {
							dispatch(setMyAssignment(null));

							return;
						}

						try {
							const data = participantDoc.data();
							const parsedParticipant = parse(RoomParticipantSchema, data);
							dispatch(setMyAssignment(parsedParticipant));
						} catch (parseError) {
							logError(parseError, {
								operation: 'roomAssignment.listenToMyAssignment.parse',
								statementId,
								userId,
							});
						}
					},
					(error) => {
						logError(error, {
							operation: 'roomAssignment.listenToMyAssignment.participant',
							statementId,
							userId,
						});
					}
				);
			},
			(error) => {
				logError(error, {
					operation: 'roomAssignment.listenToMyAssignment.settings',
					statementId,
					userId,
				});
			}
		);

		// Return cleanup function
		return () => {
			settingsUnsubscribe();
			if (participantUnsubscribe) {
				participantUnsubscribe();
			}
		};
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.listenToMyAssignment.setup',
			statementId,
			userId,
		});

		return () => {};
	}
}

/**
 * Get all room data for admin view (settings, rooms, participants)
 */
export async function getRoomAssignmentDataForAdmin(
	statementId: string,
	dispatch: AppDispatch
): Promise<{
	settings: RoomSettings | null;
	rooms: Room[];
	participants: RoomParticipant[];
}> {
	try {
		dispatch(setLoading(true));

		// Get active settings
		const settingsRef = collection(FireStore, Collections.roomsSettings);
		const settingsQuery = query(
			settingsRef,
			where('statementId', '==', statementId),
			where('status', '==', 'active')
		);

		const settingsSnapshot = await getDocs(settingsQuery);
		if (settingsSnapshot.empty) {
			dispatch(setLoading(false));

			return { settings: null, rooms: [], participants: [] };
		}

		const settingsDoc = settingsSnapshot.docs[0];
		const settingsData = settingsDoc.data();
		// Ensure roomSize is at least 2 to pass validation
		if (settingsData.roomSize && settingsData.roomSize < 2) {
			settingsData.roomSize = 2;
		}
		const settings = parse(RoomSettingsSchema, settingsData);
		dispatch(setRoomSettings(settings));

		const settingsId = settingsDoc.id;

		// Get rooms
		const roomsRef = collection(FireStore, Collections.rooms);
		const roomsQuery = query(roomsRef, where('settingsId', '==', settingsId));
		const roomsSnapshot = await getDocs(roomsQuery);
		const rooms: Room[] = [];
		roomsSnapshot.forEach((doc) => {
			try {
				const room = parse(RoomSchema, doc.data());
				rooms.push(room);
			} catch (parseError) {
				logError(parseError, {
					operation: 'roomAssignment.getAdminData.parseRoom',
					metadata: { docId: doc.id },
				});
			}
		});
		dispatch(setRoomsArray(rooms));

		// Get participants
		const participantsRef = collection(FireStore, Collections.roomParticipants);
		const participantsQuery = query(participantsRef, where('settingsId', '==', settingsId));
		const participantsSnapshot = await getDocs(participantsQuery);
		const participants: RoomParticipant[] = [];
		participantsSnapshot.forEach((doc) => {
			try {
				const participant = parse(RoomParticipantSchema, doc.data());
				participants.push(participant);
			} catch (parseError) {
				logError(parseError, {
					operation: 'roomAssignment.getAdminData.parseParticipant',
					metadata: { docId: doc.id },
				});
			}
		});
		dispatch(setParticipantsArray(participants));

		dispatch(setLoading(false));

		return { settings, rooms, participants };
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.getAdminData',
			statementId,
		});
		dispatch(setError('Failed to load room assignment data'));
		dispatch(setLoading(false));

		return { settings: null, rooms: [], participants: [] };
	}
}
