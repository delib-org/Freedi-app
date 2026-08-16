import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraDeviceMode,
	AgoraParticipant,
	AgoraSession,
	AgoraSessionStatus,
	AgoraTopicPackage,
	AGORA_SESSION,
	createAgoraParticipantId,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generateAnonName } from './anonNames';

interface Request {
	code: string;
	teamMemberCount?: number;
}

interface Result {
	sessionId: string;
	participantId: string;
	anonName: string;
}

/**
 * Student (or team device) joins a session by code. Creates the anonymous
 * participant doc — idempotent: rejoining returns the existing participant,
 * so a page refresh never duplicates a traveler.
 */
export const agoraJoinSession = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { code, teamMemberCount } = request.data ?? {};
		if (!code || typeof code !== 'string') {
			throw new HttpsError('invalid-argument', 'code is required');
		}

		// Codes are digits now, so the old .toUpperCase() was a no-op. Normalise
		// the same way the client does, so a stray space or dash still resolves.
		const normalisedCode = code.replace(/\D/g, '');
		if (normalisedCode.length !== AGORA_SESSION.JOIN_CODE_LENGTH) {
			throw new HttpsError('invalid-argument', 'code must be 5 digits');
		}

		try {
			const sessionSnap = await db
				.collection(Collections.agoraSessions)
				.where('code', '==', normalisedCode)
				.where('status', 'in', [AgoraSessionStatus.open, AgoraSessionStatus.live])
				.limit(1)
				.get();

			if (sessionSnap.empty) {
				throw new HttpsError('not-found', 'Session not found');
			}

			const session = sessionSnap.docs[0].data() as AgoraSession;
			const participantId = createAgoraParticipantId(session.sessionId, uid);
			const participantRef = db.collection(Collections.agoraParticipants).doc(participantId);

			const existing = await participantRef.get();
			if (existing.exists) {
				const participant = existing.data() as AgoraParticipant;

				return {
					sessionId: session.sessionId,
					participantId,
					anonName: participant.anonName,
				};
			}

			if (session.deviceMode === AgoraDeviceMode.team) {
				const size = teamMemberCount ?? 1;
				if (size < AGORA_SESSION.TEAM_SIZE_MIN || size > session.teamSizeMax) {
					throw new HttpsError('invalid-argument', 'teamMemberCount out of range');
				}
			}

			const topicSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(session.topicPackageId)
				.get();
			const language = (topicSnap.data() as AgoraTopicPackage | undefined)?.language ?? 'en';

			const now = Date.now();
			const sessionRef = db.collection(Collections.agoraSessions).doc(session.sessionId);

			/**
			 * The name and the count that produces it must be decided together.
			 *
			 * This used to read participantCount from the session snapshot fetched
			 * above, then increment it in a separate batch. A class does not trickle
			 * in — it arrives at once, on a teacher's "scan this code". Three students
			 * joining 26ms apart all read participantCount === 0 and all became
			 * "פנס אמיץ", and the teacher could not tell them apart for the rest of
			 * the lesson. Observed in production, session BxDE3d1DmbLq.
			 *
			 * Reading the session INSIDE the transaction makes the read a conflict
			 * point: concurrent joins serialise and retry against a fresh count, so
			 * indices are handed out exactly once each.
			 */
			const anonName = await db.runTransaction(async (transaction) => {
				const freshSession = await transaction.get(sessionRef);
				const count = (freshSession.data() as AgoraSession | undefined)?.participantCount ?? 0;
				const name = generateAnonName(language, count);

				const participant: AgoraParticipant = {
					participantId,
					sessionId: session.sessionId,
					userId: uid,
					anonName: name,
					...(session.deviceMode === AgoraDeviceMode.team
						? { teamMemberCount: teamMemberCount ?? 1 }
						: {}),
					points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
					joinedAt: now,
					lastActive: now,
				};

				transaction.set(participantRef, participant);
				transaction.update(sessionRef, {
					participantCount: FieldValue.increment(1),
					lastUpdate: now,
				});

				return name;
			});

			return { sessionId: session.sessionId, participantId, anonName };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.joinSession',
				userId: uid,
				metadata: { code },
			});
			throw new HttpsError('internal', 'Failed to join session');
		}
	},
);
