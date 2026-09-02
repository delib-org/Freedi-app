import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { AgoraStage, functionConfig } from '@freedi/shared-types';
import type {
	AdvanceCivicStageRequest as Request,
	AdvanceCivicStageResponse as Result,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { advanceSession } from './stageAdvance';

/**
 * Teacher-only stage transition. The session doc is the single source of
 * truth — every student client re-routes off its onSnapshot.
 *
 * Thin: the move itself lives in `advanceSession`, shared with the sweep and
 * the auto-open trigger. This wrapper only checks the request and turns the
 * typed result into the errors a caller expects. Both request shapes are
 * accepted — the plan position (`toIndex`) the Agora board sends, and the
 * stage kind (`stage`) Odyssey's admin and the older scripts send.
 */
export const agoraAdvanceStage = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, stage, toIndex } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		const target =
			typeof toIndex === 'number'
				? { toIndex }
				: stage !== undefined && Object.values(AgoraStage).includes(stage)
					? { stage }
					: null;
		if (!target) {
			throw new HttpsError('invalid-argument', 'stage or toIndex is required');
		}

		try {
			const result = await advanceSession(sessionId, target, { kind: 'teacher', uid });
			if (result.ok) return { ok: true };

			switch (result.reason) {
				case 'not-found':
					throw new HttpsError('not-found', 'Session not found');
				case 'forbidden':
					throw new HttpsError('permission-denied', 'Only the session teacher can advance stages');
				case 'stale':
					throw new HttpsError('failed-precondition', 'Stages only move forward');
				default:
					throw new HttpsError('failed-precondition', 'This session has no such stage ahead');
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.advanceStage',
				userId: uid,
				metadata: { sessionId, stage, toIndex },
			});
			throw new HttpsError('internal', 'Failed to advance stage');
		}
	},
);
