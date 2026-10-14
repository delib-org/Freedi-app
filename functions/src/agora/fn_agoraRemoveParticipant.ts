import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
	AgoraSession,
	RemoveParticipantRequest,
	RemoveParticipantResponse,
	createAgoraHandId,
	createAgoraIdentityId,
	createAgoraParticipantId,
	functionConfig,
	isAgoraAiUid,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

export interface RemoveParticipantInput {
	sessionId: string;
	teacherUid: string;
	studentUid: string;
}

/**
 * Take one student out of a live lesson, in one transaction:
 *
 *   1. the uid goes on the session's `removedUids` — the block list that
 *      `agoraJoinSession` and the statement/evaluation/vote rules read, so
 *      the same login cannot simply walk back in or keep writing;
 *   2. the participant doc is deleted — every count, camp census, lottery
 *      and console row is built from that collection, so the room shrinks by
 *      one everywhere without a single filter to forget;
 *   3. their dealt hand goes, so the notes it held count as unread again and
 *      the lottery deals them to someone who will read them;
 *   4. the real name they typed at the door goes too — the teacher no longer
 *      has a row to read it on, and it is a child's name.
 *
 * Their notes, ratings and votes stay where they are: the notes keep their
 * pseudonym, and the teacher's existing take-down is the way to hide any of
 * them. `participantCount` is NOT decremented — it is the counter pseudonyms
 * are minted from, and handing its number out again would give the next
 * arrival a classmate's name.
 *
 * Never moves the stage. Other sessions are untouched.
 */
export async function removeParticipant(
	input: RemoveParticipantInput,
	now: () => number = Date.now,
): Promise<RemoveParticipantResponse> {
	const { sessionId, teacherUid, studentUid } = input;
	const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
	const participantRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, studentUid));
	const handRef = db
		.collection(Collections.agoraHands)
		.doc(createAgoraHandId(sessionId, studentUid));
	const identityRef = db
		.collection(Collections.agoraIdentities)
		.doc(createAgoraIdentityId(sessionId, studentUid));

	return db.runTransaction(async (transaction) => {
		const [sessionSnap, participantSnap] = await Promise.all([
			transaction.get(sessionRef),
			transaction.get(participantRef),
		]);
		const session = sessionSnap.data() as AgoraSession | undefined;
		if (!session) {
			throw new HttpsError('not-found', 'Session not found');
		}
		if (session.teacherId !== teacherUid) {
			throw new HttpsError('permission-denied', 'Only the session teacher may remove a student');
		}
		if (studentUid === session.teacherId || isAgoraAiUid(studentUid)) {
			throw new HttpsError('invalid-argument', 'Not a student of this session');
		}
		const participant = participantSnap.data() as AgoraParticipant | undefined;
		if (participant?.isAI) {
			throw new HttpsError('invalid-argument', 'Not a student of this session');
		}

		const alreadyBlocked = typeof session.removedUids?.[studentUid] === 'number';
		if (!participant && alreadyBlocked) {
			return { ok: true, removed: false };
		}

		const stamp = now();
		transaction.update(sessionRef, {
			removedUids: {
				...(session.removedUids ?? {}),
				[studentUid]: session.removedUids?.[studentUid] ?? stamp,
			},
			lastUpdate: stamp,
		});
		if (participant) transaction.delete(participantRef);
		transaction.delete(handRef);
		transaction.delete(identityRef);

		return { ok: true, removed: participant !== undefined };
	});
}

/** `agoraRemoveParticipant` — see `removeParticipant` above. Session teacher only. */
export const agoraRemoveParticipant = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<RemoveParticipantRequest>,
	): Promise<RemoveParticipantResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}
		const { sessionId, studentUid } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		if (!studentUid || typeof studentUid !== 'string') {
			throw new HttpsError('invalid-argument', 'studentUid is required');
		}

		try {
			return await removeParticipant({ sessionId, teacherUid: uid, studentUid });
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.removeParticipant',
				userId: uid,
				metadata: { sessionId, studentUid },
			});
			throw new HttpsError('internal', 'Failed to remove the student');
		}
	},
);
