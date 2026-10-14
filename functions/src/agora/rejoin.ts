import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
	AgoraRemoval,
	AgoraSession,
	AGORA_REJOIN_COOLDOWN_REASON,
	ResolveRejoinResponse,
	createAgoraIdentityId,
	createAgoraParticipantId,
	createAgoraRemovalId,
	isRejoinPending,
	rejoinAllowedAt,
	removalOf,
} from '@freedi/shared-types';

/** What `agoraRemoveParticipant` parks in `agoraRemovals` */
interface ParkedSeat {
	participant?: AgoraParticipant;
}

/**
 * A removed login knocks at the door (`agoraJoinSession`). It is never
 * seated here: the knock is stamped on its removal entry for the teacher to
 * answer. One pending request per uid — a knock while one waits changes
 * nothing — and a knock inside the pause after a "not now" is refused.
 *
 * Answers the pseudonym the student will come back under, or `null` when the
 * login is no longer on the list (the teacher let it back meanwhile), in
 * which case the caller simply carries on with an ordinary rejoin.
 */
export async function knockToRejoin(
	sessionId: string,
	uid: string,
	now: () => number = Date.now,
): Promise<{ anonName: string } | null> {
	const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);

	return db.runTransaction(async (transaction) => {
		const session = (await transaction.get(sessionRef)).data() as AgoraSession | undefined;
		const removal = removalOf(session, uid);
		if (!session || !removal) return null;
		if (isRejoinPending(removal)) return { anonName: removal.anonName };

		const stamp = now();
		if (stamp < rejoinAllowedAt(removal)) {
			throw new HttpsError('failed-precondition', AGORA_REJOIN_COOLDOWN_REASON);
		}
		const knocked: AgoraRemoval = { ...removal, requestedAt: stamp };
		transaction.update(sessionRef, {
			removedUids: { ...(session.removedUids ?? {}), [uid]: knocked },
			lastUpdate: stamp,
		});

		return { anonName: removal.anonName };
	});
}

export interface ResolveRejoinInput {
	sessionId: string;
	teacherUid: string;
	studentUid: string;
	decision: 'approve' | 'decline';
}

/**
 * The session teacher answers a knock — and only a knock: a removed student
 * who has not asked is not let back by a stale button.
 *
 * Approve: the entry leaves `removedUids` and the parked seat comes back as
 * it was — same pseudonym, camp, points and credit guards — so their earlier
 * notes are theirs again. `participantCount` is untouched (nothing new was
 * minted). The real name they typed when they knocked stays for the console.
 *
 * Decline: `declinedAt` answers the request; the real name typed with it is
 * deleted; they may knock again after AGORA_REJOIN.REQUEST_COOLDOWN_MS.
 *
 * Never moves the stage.
 */
export async function resolveRejoin(
	input: ResolveRejoinInput,
	now: () => number = Date.now,
): Promise<ResolveRejoinResponse> {
	const { sessionId, teacherUid, studentUid, decision } = input;
	const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
	const participantRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, studentUid));
	const parkedRef = db
		.collection(Collections.agoraRemovals)
		.doc(createAgoraRemovalId(sessionId, studentUid));
	const identityRef = db
		.collection(Collections.agoraIdentities)
		.doc(createAgoraIdentityId(sessionId, studentUid));

	return db.runTransaction(async (transaction) => {
		const [sessionSnap, participantSnap, parkedSnap] = await Promise.all([
			transaction.get(sessionRef),
			transaction.get(participantRef),
			transaction.get(parkedRef),
		]);
		const session = sessionSnap.data() as AgoraSession | undefined;
		if (!session) {
			throw new HttpsError('not-found', 'Session not found');
		}
		if (session.teacherId !== teacherUid) {
			throw new HttpsError('permission-denied', 'Only the session teacher may answer');
		}
		const removal = removalOf(session, studentUid);
		if (!removal || !isRejoinPending(removal)) {
			throw new HttpsError('failed-precondition', 'no-request');
		}

		const stamp = now();
		if (decision === 'decline') {
			transaction.update(sessionRef, {
				removedUids: {
					...(session.removedUids ?? {}),
					[studentUid]: { ...removal, declinedAt: stamp },
				},
				lastUpdate: stamp,
			});
			transaction.delete(identityRef);

			return { ok: true, decision };
		}

		const remaining = { ...(session.removedUids ?? {}) };
		delete remaining[studentUid];
		transaction.update(sessionRef, { removedUids: remaining, lastUpdate: stamp });

		if (!participantSnap.exists) {
			const parked = (parkedSnap.data() as ParkedSeat | undefined)?.participant;
			const seat: AgoraParticipant = parked
				? { ...parked, anonName: removal.anonName, lastActive: stamp }
				: {
						participantId: participantRef.id,
						sessionId,
						userId: studentUid,
						anonName: removal.anonName,
						points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
						joinedAt: stamp,
						lastActive: stamp,
					};
			transaction.set(participantRef, seat);
		}
		transaction.delete(parkedRef);

		return { ok: true, decision };
	});
}
