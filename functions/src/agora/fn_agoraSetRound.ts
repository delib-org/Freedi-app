import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraRoundPhase,
	AgoraSession,
	AgoraStage,
	AGORA_SESSION,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

interface Request {
	sessionId: string;
	roundPhase: AgoraRoundPhase;
	roundLengthMs?: number;
}

interface Result {
	roundNumber: number;
}

/**
 * Teacher round control inside the deliberation stage. Starting a
 * `propose` phase begins a new round; `rate` and `improve` continue the
 * current one. roundEndsAt drives the student-side fuse countdown
 * (soft-lock only — the session doc remains the single source of truth).
 */
export const agoraSetRound = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, roundPhase, roundLengthMs } = request.data ?? {};
		if (!sessionId || !Object.values(AgoraRoundPhase).includes(roundPhase)) {
			throw new HttpsError('invalid-argument', 'sessionId and a valid roundPhase required');
		}

		try {
			const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
			const sessionSnap = await sessionRef.get();
			if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found');
			const session = sessionSnap.data() as AgoraSession;

			if (session.teacherId !== uid) {
				throw new HttpsError('permission-denied', 'Only the session teacher controls rounds');
			}
			if (session.stage !== AgoraStage.deliberation) {
				throw new HttpsError('failed-precondition', 'Rounds only run in the deliberation stage');
			}

			const roundNumber =
				roundPhase === AgoraRoundPhase.propose
					? session.roundNumber + 1
					: Math.max(1, session.roundNumber);

			await sessionRef.update({
				roundNumber,
				roundPhase,
				roundEndsAt: Date.now() + (roundLengthMs ?? AGORA_SESSION.DEFAULT_ROUND_MS),
				lastUpdate: Date.now(),
			});

			return { roundNumber };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.setRound',
				userId: uid,
				metadata: { sessionId, roundPhase },
			});
			throw new HttpsError('internal', 'Failed to set round');
		}
	}
);
