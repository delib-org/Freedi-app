import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

interface Request {
	sessionId: string;
	stage: AgoraStage;
}

interface Result {
	ok: boolean;
}

/** Forward order of the game stages — the teacher can only move forward */
const STAGE_ORDER: AgoraStage[] = [
	AgoraStage.lobby,
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.valueIdentification,
	AgoraStage.positioning,
	AgoraStage.deliberation,
	AgoraStage.results,
	AgoraStage.ended,
];

/**
 * Teacher-only stage transition. The session doc is the single source of
 * truth — every student client re-routes off its onSnapshot.
 */
export const agoraAdvanceStage = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, stage } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		if (!Object.values(AgoraStage).includes(stage)) {
			throw new HttpsError('invalid-argument', 'Unknown stage');
		}

		try {
			const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
			const sessionSnap = await sessionRef.get();
			if (!sessionSnap.exists) {
				throw new HttpsError('not-found', 'Session not found');
			}

			const session = sessionSnap.data() as AgoraSession;
			if (session.teacherId !== uid) {
				throw new HttpsError('permission-denied', 'Only the session teacher can advance stages');
			}

			const fromIndex = STAGE_ORDER.indexOf(session.stage);
			const toIndex = STAGE_ORDER.indexOf(stage);
			if (toIndex <= fromIndex) {
				throw new HttpsError('failed-precondition', 'Stages only move forward');
			}

			const status =
				stage === AgoraStage.ended
					? AgoraSessionStatus.ended
					: AgoraSessionStatus.live;

			await sessionRef.update({
				stage,
				status,
				lastUpdate: Date.now(),
			});

			return { ok: true };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.advanceStage',
				userId: uid,
				metadata: { sessionId, stage },
			});
			throw new HttpsError('internal', 'Failed to advance stage');
		}
	}
);
