import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCamp,
	AgoraCampAggregate,
	AgoraParticipant,
	AgoraProposalScore,
	Evaluation,
	AGORA_BRIDGING,
	AGORA_POINTS,
	calcBridgingScore,
	createAgoraParticipantId,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { awardCredit } from '../engagement/credits/creditEngine';
import { CreditAction, SourceApp } from '@freedi/shared-types';

interface CampDelta {
	sum: number;
	n: number;
	positiveN: number;
}

function applyDelta(aggregate: AgoraCampAggregate, delta: CampDelta): AgoraCampAggregate {
	return {
		sum: aggregate.sum + delta.sum,
		n: aggregate.n + delta.n,
		positiveN: aggregate.positiveN + delta.positiveN,
	};
}

function emptyAggregate(): AgoraCampAggregate {
	return { sum: 0, n: 0, positiveN: 0 };
}

/**
 * Camp-aware bridging engine. Coexists with the generic evaluation
 * pipeline (which still computes agreementIndex); this trigger only
 * maintains the per-camp aggregates + bridgingScore in agoraScores.
 * Guard: returns immediately unless the evaluation carries agoraSessionId.
 */
export const onAgoraEvaluationWritten = onDocumentWritten(
	{ document: `${Collections.evaluations}/{evaluationId}`, ...functionConfig },
	async (event) => {
		const after = event.data?.after.exists ? (event.data.after.data() as Evaluation) : null;
		const before = event.data?.before.exists ? (event.data.before.data() as Evaluation) : null;
		const evaluation = after ?? before;
		if (!evaluation?.agoraSessionId) return;

		const { agoraSessionId: sessionId, statementId, evaluatorId } = evaluation;

		try {
			// Evaluator's camp — server-authoritative, never taken from the client
			const evaluatorSnap = await db
				.collection(Collections.agoraParticipants)
				.doc(createAgoraParticipantId(sessionId, evaluatorId))
				.get();
			const evaluatorCamp = (evaluatorSnap.data() as AgoraParticipant | undefined)?.camp;
			if (!evaluatorCamp) return; // not positioned yet — rating doesn't count for bridging

			const beforeValue = before?.evaluation ?? null;
			const afterValue = after?.evaluation ?? null;
			const delta: CampDelta = {
				sum: (afterValue ?? 0) - (beforeValue ?? 0),
				n: (afterValue !== null ? 1 : 0) - (beforeValue !== null ? 1 : 0),
				positiveN:
					(afterValue !== null && afterValue > 0 ? 1 : 0) -
					(beforeValue !== null && beforeValue > 0 ? 1 : 0),
			};
			if (delta.sum === 0 && delta.n === 0 && delta.positiveN === 0) return;

			const scoreRef = db.collection(Collections.agoraScores).doc(statementId);

			const authorToCredit = await db.runTransaction(async (transaction) => {
				const scoreSnap = await transaction.get(scoreRef);
				let score: AgoraProposalScore;

				if (scoreSnap.exists) {
					score = scoreSnap.data() as AgoraProposalScore;
				} else {
					// Lazy init: resolve the proposal author's camp once
					const proposalSnap = await transaction.get(
						db.collection(Collections.statements).doc(statementId),
					);
					const creatorId = proposalSnap.data()?.creatorId as string | undefined;
					let authorCamp = AgoraCamp.center;
					if (creatorId) {
						const authorSnap = await transaction.get(
							db
								.collection(Collections.agoraParticipants)
								.doc(createAgoraParticipantId(sessionId, creatorId)),
						);
						authorCamp =
							(authorSnap.data() as AgoraParticipant | undefined)?.camp ?? AgoraCamp.center;
					}
					score = {
						statementId,
						sessionId,
						authorCamp,
						perCamp: {
							left: emptyAggregate(),
							right: emptyAggregate(),
							center: emptyAggregate(),
						},
						bridgingScore: 0,
						lastUpdate: Date.now(),
					};
				}

				score.perCamp[evaluatorCamp] = applyDelta(score.perCamp[evaluatorCamp], delta);
				score.bridgingScore = calcBridgingScore({
					authorCamp: score.authorCamp,
					perCamp: score.perCamp,
				});
				score.lastUpdate = Date.now();

				let creditAuthor = false;
				if (
					score.bridgingScore >= AGORA_BRIDGING.CREDIT_THRESHOLD &&
					!score.bridgingCreditAwardedAt
				) {
					score.bridgingCreditAwardedAt = Date.now();
					creditAuthor = true;
				}

				transaction.set(scoreRef, score);

				return creditAuthor ? score : null;
			});

			// Bridging bonus for the author — once per proposal
			if (authorToCredit) {
				const proposalSnap = await db.collection(Collections.statements).doc(statementId).get();
				const creatorId = proposalSnap.data()?.creatorId as string | undefined;
				if (creatorId) {
					// Cross-app engagement credit for reaching cross-camp consensus
					awardCredit({
						userId: creatorId,
						action: CreditAction.CONSENSUS_REACHED,
						sourceApp: SourceApp.AGORA,
						statementId,
					}).catch((creditError: unknown) => {
						logError(creditError, {
							operation: 'agora.onEvaluationWritten.awardCredit',
							userId: creatorId,
						});
					});
					const authorRef = db
						.collection(Collections.agoraParticipants)
						.doc(createAgoraParticipantId(sessionId, creatorId));
					await db.runTransaction(async (transaction) => {
						const authorSnap = await transaction.get(authorRef);
						if (!authorSnap.exists) return;
						const participant = authorSnap.data() as AgoraParticipant;
						const points = { ...participant.points };
						points.proposals += AGORA_POINTS.BRIDGING_BONUS;
						points.total += AGORA_POINTS.BRIDGING_BONUS;
						transaction.update(authorRef, { points, lastActive: Date.now() });
					});
				}
			}
		} catch (error) {
			logError(error, {
				operation: 'agora.onEvaluationWritten',
				statementId,
				metadata: { sessionId, evaluatorId },
			});
		}
	},
);
