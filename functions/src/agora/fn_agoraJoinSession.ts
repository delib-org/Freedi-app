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

		try {
			const sessionSnap = await db
				.collection(Collections.agoraSessions)
				.where('code', '==', code.toUpperCase())
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
			const anonName = generateAnonName(language, session.participantCount);

			const participant: AgoraParticipant = {
				participantId,
				sessionId: session.sessionId,
				userId: uid,
				anonName,
				...(session.deviceMode === AgoraDeviceMode.team
					? { teamMemberCount: teamMemberCount ?? 1 }
					: {}),
				points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
				joinedAt: now,
				lastActive: now,
			};

			const batch = db.batch();
			batch.set(participantRef, participant);
			batch.update(db.collection(Collections.agoraSessions).doc(session.sessionId), {
				participantCount: FieldValue.increment(1),
				lastUpdate: now,
			});
			await batch.commit();

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
