import { doc, runTransaction, setDoc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { DB } from "../config";
import { Collections, Creator, Statement } from "delib-npm";
import { store } from "@/redux/store";
import { logError } from "@/utils/errorHandling";
import { JoinedParticipant, createJoinedParticipantId } from "@/types/roomAssignment";

// Collection name for joined participants with spectrum data
const JOINED_PARTICIPANTS_COLLECTION = "joinedParticipants";

export async function toggleJoining(statementId: string) {
	try {
		const creator = store.getState().creator.creator;
		if (!creator) throw new Error("Creator not found in user state");
		if (!statementId) throw new Error("Statement ID is required");

		const statementRef = doc(DB, Collections.statements, statementId);

		await runTransaction(DB, async (transaction) => {
			const statementDB = await transaction.get(statementRef);
			if (!statementDB.exists()) throw new Error("Statement does not exist");
			const statement = statementDB.data() as Statement;

			if (!statement?.joined) {
				transaction.update(statementRef, {
					joined: [creator]
				});

				return;
			}

			const isUserJoined = statement.joined?.find((user: Creator) => user.uid === creator.uid) ? true : false;

			const updatedJoined = isUserJoined
				? statement.joined.filter((user: Creator) => user.uid !== creator.uid)
				: [...(statement.joined || []), creator];

			transaction.update(statementRef, {
				joined: updatedJoined
			});
		});

	} catch (error) {
		logError(error, {
			operation: 'joining.toggleJoining',
			statementId,
		});
	}
}

/**
 * Toggle joining with spectrum data for ILP room assignment
 * @param statementId - The option statement ID to join/leave
 * @param spectrum - The spectrum position (1-5) for diversity-based room assignment
 * @returns Promise<boolean> - true if now joined, false if left
 */
export async function toggleJoiningWithSpectrum(
	statementId: string,
	spectrum: number
): Promise<boolean> {
	try {
		const creator = store.getState().creator.creator;
		if (!creator) throw new Error("Creator not found in user state");
		if (!statementId) throw new Error("Statement ID is required");
		// Spectrum can be a continuous value between 1 and 5
		if (spectrum < 1 || spectrum > 5) throw new Error("Spectrum must be between 1 and 5");

		const statementRef = doc(DB, Collections.statements, statementId);
		const participantId = createJoinedParticipantId(statementId, creator.uid);
		const participantRef = doc(DB, JOINED_PARTICIPANTS_COLLECTION, participantId);

		let isNowJoined = false;

		await runTransaction(DB, async (transaction) => {
			const statementDB = await transaction.get(statementRef);
			if (!statementDB.exists()) throw new Error("Statement does not exist");
			const statement = statementDB.data() as Statement;

			const isUserJoined = statement.joined?.find((user: Creator) => user.uid === creator.uid) ? true : false;

			if (isUserJoined) {
				// Leaving - remove from joined array and delete participant document
				const updatedJoined = statement.joined?.filter((user: Creator) => user.uid !== creator.uid) || [];
				transaction.update(statementRef, { joined: updatedJoined });
				transaction.delete(participantRef);
				isNowJoined = false;
			} else {
				// Joining - add to joined array and create participant document with spectrum
				const updatedJoined = [...(statement.joined || []), creator];
				transaction.update(statementRef, { joined: updatedJoined });

				const joinedParticipant: JoinedParticipant = {
					participantId,
					statementId,
					parentId: statement.parentId,
					userId: creator.uid,
					userName: creator.displayName || 'Anonymous',
					userPhoto: creator.photoURL,
					spectrum,
					joinedAt: Date.now(),
				};
				transaction.set(participantRef, joinedParticipant);
				isNowJoined = true;
			}
		});

		return isNowJoined;
	} catch (error) {
		logError(error, {
			operation: 'joining.toggleJoiningWithSpectrum',
			statementId,
			metadata: { spectrum },
		});
		throw error;
	}
}

/**
 * Check if user has already joined with spectrum data
 * @param statementId - The option statement ID
 * @returns The JoinedParticipant if exists, null otherwise
 */
export async function getJoinedParticipant(statementId: string): Promise<JoinedParticipant | null> {
	try {
		const creator = store.getState().creator.creator;
		if (!creator) return null;

		const participantId = createJoinedParticipantId(statementId, creator.uid);
		const participantRef = doc(DB, JOINED_PARTICIPANTS_COLLECTION, participantId);
		const participantDoc = await getDoc(participantRef);

		if (participantDoc.exists()) {
			return participantDoc.data() as JoinedParticipant;
		}

		return null;
	} catch (error) {
		logError(error, {
			operation: 'joining.getJoinedParticipant',
			statementId,
		});

		return null;
	}
}

/**
 * Update spectrum value for an already joined participant
 * @param statementId - The option statement ID
 * @param spectrum - The new spectrum position (1-5)
 */
export async function updateJoinedParticipantSpectrum(
	statementId: string,
	spectrum: number
): Promise<void> {
	try {
		const creator = store.getState().creator.creator;
		if (!creator) throw new Error("Creator not found in user state");
		if (spectrum < 1 || spectrum > 5) throw new Error("Spectrum must be between 1 and 5");

		const participantId = createJoinedParticipantId(statementId, creator.uid);
		const participantRef = doc(DB, JOINED_PARTICIPANTS_COLLECTION, participantId);
		const participantDoc = await getDoc(participantRef);

		if (!participantDoc.exists()) {
			throw new Error("Participant not found - must join first");
		}

		await setDoc(participantRef, { spectrum }, { merge: true });
	} catch (error) {
		logError(error, {
			operation: 'joining.updateJoinedParticipantSpectrum',
			statementId,
			metadata: { spectrum },
		});
		throw error;
	}
}

/**
 * Get user's spectrum value for a parent question
 * This checks if the user has already rated themselves for any option under this parent
 * @param parentId - The parent question's statement ID
 * @returns The spectrum value if found, null otherwise
 */
export async function getUserSpectrumForParent(parentId: string): Promise<number | null> {
	try {
		const creator = store.getState().creator.creator;
		if (!creator) return null;

		// Query joinedParticipants where parentId matches and userId matches
		const participantsRef = collection(DB, JOINED_PARTICIPANTS_COLLECTION);
		const q = query(
			participantsRef,
			where('parentId', '==', parentId),
			where('userId', '==', creator.uid),
			limit(1)
		);

		const querySnapshot = await getDocs(q);

		if (!querySnapshot.empty) {
			const participant = querySnapshot.docs[0].data() as JoinedParticipant;

			return participant.spectrum;
		}

		return null;
	} catch (error) {
		logError(error, {
			operation: 'joining.getUserSpectrumForParent',
			metadata: { parentId },
		});

		return null;
	}
}