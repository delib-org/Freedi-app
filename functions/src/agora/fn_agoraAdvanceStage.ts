import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraRoundPhase,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	AGORA_CYCLE,
	functionConfig,
	resolveSessionFlow,
	sessionRunsVoting,
} from '@freedi/shared-types';
import type {
	AdvanceCivicStageRequest as Request,
	AdvanceCivicStageResponse as Result,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { computeSessionResults } from './classScore';
import { prepareVotingStage } from './votingStage';

/**
 * Forward order of the game stages — the teacher can only move forward.
 * valueIdentification was removed from the flow (too much cognitive load —
 * a heavy writing task right before the proposal writing); the enum value
 * remains so sessions already at that stage keep working, and old sessions
 * there may advance to positioning (it sits between needs and positioning
 * in the legacy order).
 */
const STAGE_ORDER: AgoraStage[] = [
	AgoraStage.lobby,
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.deliberation,
	AgoraStage.voting,
	AgoraStage.results,
	AgoraStage.ended,
];

/** Legacy sessions stuck on the removed stage advance into this order after needs */
const LEGACY_STAGE_POSITION: Partial<Record<AgoraStage, number>> = {
	[AgoraStage.valueIdentification]: STAGE_ORDER.indexOf(AgoraStage.needs),
};

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

			const flow = resolveSessionFlow(session);
			// A session that runs no vote must not be walked into one: the ballot
			// would be drawn up, the room would be asked to elect something, and
			// the results screen would report an election nobody meant to hold.
			// `sessionRunsVoting` is the ONE answer to "does this session vote" —
			// the teacher panel asks the same helper, so the button it offers and
			// the gate here can never drift apart again.
			if (stage === AgoraStage.voting && !sessionRunsVoting(session)) {
				throw new HttpsError('failed-precondition', 'This session runs without a voting stage');
			}

			const fromIndex =
				STAGE_ORDER.indexOf(session.stage) !== -1
					? STAGE_ORDER.indexOf(session.stage)
					: (LEGACY_STAGE_POSITION[session.stage] ?? -1);
			const toIndex = STAGE_ORDER.indexOf(stage);
			if (toIndex <= fromIndex) {
				throw new HttpsError('failed-precondition', 'Stages only move forward');
			}

			const status =
				stage === AgoraStage.ended ? AgoraSessionStatus.ended : AgoraSessionStatus.live;

			// Entering deliberation auto-starts round 1 (propose) — otherwise
			// students wait on "the teacher is opening the next round" while the
			// teacher's prominent CTA is already pointing at the NEXT stage.
			const roundStart =
				stage === AgoraStage.deliberation && session.roundNumber === 0
					? {
							roundNumber: 1,
							roundPhase: AgoraRoundPhase.propose,
							roundEndsAt: Date.now() + AGORA_CYCLE.DELIBERATION_TOTAL_MS,
						}
					: {};

			await sessionRef.update({
				stage,
				status,
				...roundStart,
				lastUpdate: Date.now(),
			});

			// Entering voting: draw up the ballot. Only forward moves are legal,
			// so a teacher who goes deliberation → results simply never holds a
			// vote — voting is a stage the class may skip, not one it must pass.
			if (stage === AgoraStage.voting) {
				await prepareVotingStage(sessionId);
			}

			// Entering results: run the AI plausibility batch + health-metric
			// simulation + class score. Students see a "computing" state until
			// session.classScore lands via their listener.
			//
			// A camp-less room is scored on convergence instead, and that score
			// cannot be computed here — it needs the closing ratings, which people
			// have not given yet. So the field is opened empty and filled in by
			// `agoraRerateStances` as they arrive, which is also what lets the
			// screen climb while the room is still answering.
			if (stage === AgoraStage.results) {
				if (flow.scoreMode === 'convergence') {
					await sessionRef.update({
						convergence: {
							before: null,
							after: null,
							score: null,
							participants: 0,
							computedAt: Date.now(),
						},
					});
				} else {
					await computeSessionResults(sessionId);
				}
			}

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
	},
);
