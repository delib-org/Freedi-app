import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraSession,
	AgoraStage,
	ChallengePhase,
	Collections,
	NO_VOTE,
	Vote,
	ballotTallyIds,
	functionConfig,
} from '@freedi/shared-types';
import { goalZoneCandidates, prepareVotingStage } from './votingStage';
import { logError } from '../utils/errorHandling';

interface Request {
	sessionId: string;
	goalZoneOnly: boolean;
}

interface Result {
	/** Candidates on the ballot after the redraw; absent when the vote is not open */
	candidates?: number;
	/** Votes withdrawn because their proposal left the ballot */
	withdrawn?: number;
}

/**
 * The teacher's goal switch while the vote is open.
 *
 * The ballot is frozen for students (rules), and that stays true: this is the
 * teacher deciding, server-side, that only the proposals standing in the goal
 * are on it. The same `prepareVotingStage` that drew it redraws it, so the
 * student ballot, the council board and the recap's winner all read one list.
 * A vote for a proposal that left the ballot is withdrawn (written `none`,
 * never deleted, so the counting trigger decrements it) and that student
 * simply votes again. Before the vote opens this only stores the setting.
 */
export const agoraSetBallotGoalOnly = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');

		const { sessionId, goalZoneOnly } = request.data ?? {};
		if (!sessionId || typeof goalZoneOnly !== 'boolean') {
			throw new HttpsError('invalid-argument', 'sessionId and goalZoneOnly are required');
		}

		try {
			const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
			const sessionSnap = await sessionRef.get();
			if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found');
			const session = sessionSnap.data() as AgoraSession;
			if (session.teacherId !== uid) {
				throw new HttpsError('permission-denied', 'Only the session teacher sets the ballot');
			}

			if (session.stage !== AgoraStage.voting) {
				await sessionRef.update({
					'votingSettings.goalZoneOnly': goalZoneOnly,
					lastUpdate: Date.now(),
				});

				return {};
			}

			const phase = session.votingGame?.phase;
			if (phase === ChallengePhase.vote || phase === ChallengePhase.resolving) {
				throw new HttpsError('failed-precondition', 'challenge-live');
			}
			if (goalZoneOnly && (await goalZoneCandidates(sessionId)).length === 0) {
				throw new HttpsError('failed-precondition', 'no-goal-proposals');
			}

			await sessionRef.update({
				'votingSettings.goalZoneOnly': goalZoneOnly,
				lastUpdate: Date.now(),
			});
			await prepareVotingStage(sessionId);

			const redrawn = (await sessionRef.get()).data() as AgoraSession;
			const standing = new Set(ballotTallyIds(redrawn.voting?.candidateIds ?? []));
			const votesSnap = await db
				.collection(Collections.votes)
				.where('parentId', '==', session.challengeQuestionId)
				.get();
			const orphaned = votesSnap.docs.filter((docSnap) => {
				const vote = docSnap.data() as Vote;

				return !!vote.statementId && vote.statementId !== NO_VOTE && !standing.has(vote.statementId);
			});
			await Promise.all(
				orphaned.map((docSnap) =>
					docSnap.ref.update({ statementId: NO_VOTE, lastUpdate: Date.now() }),
				),
			);

			return { candidates: standing.size, withdrawn: orphaned.length };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.setBallotGoalOnly',
				userId: uid,
				metadata: { sessionId, goalZoneOnly },
			});
			throw new HttpsError('internal', 'Failed to redraw the ballot');
		}
	},
);
