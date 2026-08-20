import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
	AgoraSession,
	AgoraStage,
	AttitudeMap,
	CONVERGENCE_MIN_SHARED_CAP,
	Evaluation,
	ODYSSEY_GAME_FIELD,
	convergenceMeans,
	convergenceScore,
	createAgoraParticipantId,
	functionConfig,
	resolveSessionFlow,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

interface Request {
	sessionId: string;
	/** stance statementId → attitude, on the standard -1..1 evaluation scale */
	ratings: Record<string, number>;
}

interface Result {
	before: number | null;
	after: number | null;
	score: number | null;
	participants: number;
}

/**
 * The closing question of a camp-less event: having heard everyone, where do
 * you stand on the island now?
 *
 * The answers are written as ordinary Freedi evaluations at the same
 * deterministic `${uid}--${stanceId}` ids Odyssey uses, not into some
 * event-local store. That is the whole point of asking: the sea, the opinion
 * map and the shared consensus pipeline all read those documents, so an
 * afternoon of deliberation shows up on the player's own map the next time
 * they open it. A private copy would have made the event a dead end.
 *
 * Convergence is recomputed here, in the same call, rather than by a trigger
 * or a nightly job — the room is small, the arithmetic is pairwise over four
 * stances, and doing it inline means the results screen moves while people are
 * still finishing.
 */
export const agoraRerateStances = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, ratings } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		if (!ratings || typeof ratings !== 'object' || !Object.keys(ratings).length) {
			throw new HttpsError('invalid-argument', 'ratings are required');
		}
		for (const value of Object.values(ratings)) {
			if (typeof value !== 'number' || value < -1 || value > 1) {
				throw new HttpsError('invalid-argument', 'every rating must be between -1 and 1');
			}
		}

		try {
			const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
			if (!sessionSnap.exists) {
				throw new HttpsError('not-found', 'Session not found');
			}
			const session = sessionSnap.data() as AgoraSession;

			const flow = resolveSessionFlow(session);
			if (flow.scoreMode !== 'convergence') {
				throw new HttpsError('failed-precondition', 'This session is not scored on convergence');
			}
			const islandStatementId = session.civic?.islandStatementId;
			if (!islandStatementId) {
				throw new HttpsError('failed-precondition', 'Session has no island to re-rate');
			}
			if (session.stage !== AgoraStage.voting && session.stage !== AgoraStage.results) {
				throw new HttpsError('failed-precondition', 'The deliberation is still running');
			}

			const participantRef = db
				.collection(Collections.agoraParticipants)
				.doc(createAgoraParticipantId(sessionId, uid));
			const participantSnap = await participantRef.get();
			if (!participantSnap.exists) {
				throw new HttpsError('permission-denied', 'Only participants can re-rate');
			}

			// Ratings must belong to THIS island. Without the check a caller could
			// write evaluations onto any statement in the database through a
			// callable that exists to record four of them.
			const stanceSnaps = await db
				.collection(Collections.statements)
				.where('parentId', '==', islandStatementId)
				.get();
			const stanceIds = new Set(stanceSnaps.docs.map((doc) => doc.id));
			for (const stanceId of Object.keys(ratings)) {
				if (!stanceIds.has(stanceId)) {
					throw new HttpsError('invalid-argument', 'A rating names a stance of another island');
				}
			}

			const now = Date.now();
			const token = request.auth?.token as Record<string, unknown> | undefined;
			const evaluator = {
				uid,
				displayName: typeof token?.name === 'string' ? token.name : 'מפליג/ה',
				isAnonymous: request.auth?.token.firebase.sign_in_provider === 'anonymous',
			};

			const batch = db.batch();
			for (const [stanceId, value] of Object.entries(ratings)) {
				const evaluationId = `${uid}--${stanceId}`;
				const evaluation: Evaluation = {
					evaluationId,
					parentId: islandStatementId,
					statementId: stanceId,
					evaluatorId: uid,
					evaluator,
					evaluation: value,
					updatedAt: now,
					...(session.civic?.odysseyGameId
						? { [ODYSSEY_GAME_FIELD]: session.civic.odysseyGameId }
						: {}),
				} as Evaluation;
				batch.set(db.collection(Collections.evaluations).doc(evaluationId), evaluation, {
					merge: true,
				});
			}
			batch.update(participantRef, { reratedAt: now, lastActive: now });
			await batch.commit();

			// Everyone who both arrived with a recorded position and has now told
			// us where they ended up. Anyone missing either half is left out of
			// both means by `convergenceMeans` — see the note there on why.
			const participantsSnap = await db
				.collection(Collections.agoraParticipants)
				.where('sessionId', '==', sessionId)
				.get();

			const baselines = new Map<string, AttitudeMap>();
			const rerated: AgoraParticipant[] = [];
			for (const doc of participantsSnap.docs) {
				const participant = doc.data() as AgoraParticipant;
				if (participant.isAI) continue;
				if (!participant.stanceBaseline) continue;
				baselines.set(participant.userId, participant.stanceBaseline);
				// The doc we just wrote may not be in this read yet.
				if (participant.reratedAt || participant.userId === uid) rerated.push(participant);
			}

			const currentSnaps = await db.getAll(
				...rerated.flatMap((participant) =>
					[...stanceIds].map((stanceId) =>
						db.collection(Collections.evaluations).doc(`${participant.userId}--${stanceId}`),
					),
				),
			);
			const current = new Map<string, AttitudeMap>();
			for (const snap of currentSnaps) {
				const data = snap.data() as Evaluation | undefined;
				if (!data || typeof data.evaluation !== 'number') continue;
				const map = current.get(data.evaluatorId) ?? {};
				map[data.statementId] = data.evaluation;
				current.set(data.evaluatorId, map);
			}

			const means = convergenceMeans({
				baselines,
				current,
				minShared: Math.min(CONVERGENCE_MIN_SHARED_CAP, stanceIds.size),
			});
			const score = convergenceScore(means.before, means.after);

			await sessionSnap.ref.update({
				convergence: {
					before: means.before,
					after: means.after,
					score,
					participants: means.participants,
					computedAt: now,
				},
				lastUpdate: now,
			});

			return {
				before: means.before,
				after: means.after,
				score,
				participants: means.participants,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.rerateStances',
				userId: uid,
				metadata: { sessionId },
			});
			throw new HttpsError('internal', 'Failed to record the closing ratings');
		}
	},
);
