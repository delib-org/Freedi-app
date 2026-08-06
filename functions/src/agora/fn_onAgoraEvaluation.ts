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
	NotificationTriggerType,
	StatementType,
	bridgingPayout,
	bridgingTierFor,
	calcBridgingScore,
	createAgoraParticipantId,
	functionConfig,
	getRandomUID,
	isAgoraAiUid,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { awardCredit } from '../engagement/credits/creditEngine';
import { CreditAction, SourceApp } from '@freedi/shared-types';

interface CampDelta {
	sum: number;
	n: number;
	positiveN: number;
}

/**
 * How many STUDENTS sit in the camps that count as "other" for this author.
 * Without it the confidence ramp always divides by MIN_CROSS_RATERS, which
 * makes the bridging credit arithmetically unreachable in a small class —
 * with two students there is at most one cross-camp rater, so confidence
 * caps at 1/3 forever. Read outside the transaction: a slightly stale count
 * only nudges a ramp, and it keeps the hot path to a single query.
 */
interface CampCounts {
	left: number;
	right: number;
	center: number;
}

async function readCampCounts(sessionId: string): Promise<CampCounts> {
	const snapshot = await db
		.collection(Collections.agoraParticipants)
		.where('sessionId', '==', sessionId)
		.get();

	const counts: CampCounts = { left: 0, right: 0, center: 0 };
	snapshot.forEach((docSnap) => {
		const participant = docSnap.data() as AgoraParticipant;
		if (participant.isAI) return; // synthetic raters never size the pool
		if (participant.camp === AgoraCamp.left) counts.left++;
		else if (participant.camp === AgoraCamp.right) counts.right++;
		else if (participant.camp === AgoraCamp.center) counts.center++;
	});

	return counts;
}

/**
 * Mirrors calcBridgingScore's blend: for a wing author the other wing is
 * "other" and the center counts at half weight; a center author faces both
 * wings.
 */
function crossCampPoolFor(authorCamp: AgoraCamp, counts: CampCounts): number {
	if (authorCamp === AgoraCamp.center) return counts.left + counts.right;

	const otherWing = authorCamp === AgoraCamp.left ? counts.right : counts.left;

	return otherWing + counts.center * AGORA_BRIDGING.CENTER_CAMP_WEIGHT;
}

/**
 * Credit the evaluator for doing the work the whole game depends on.
 * Value-blind (identical for "strongly against" and "strongly for") and
 * first-rating-only, so there is no incentive to rate in any direction or
 * to toggle a rating for points.
 */
async function creditRatingEffort(sessionId: string, evaluatorId: string): Promise<void> {
	if (isAgoraAiUid(evaluatorId)) return;
	const raterRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, evaluatorId));

	await db.runTransaction(async (transaction) => {
		const snap = await transaction.get(raterRef);
		if (!snap.exists) return;
		const participant = snap.data() as AgoraParticipant;
		const credited = participant.creditedRatings ?? 0;
		if (credited >= AGORA_POINTS.RATING_CREDIT_MAX_RATINGS) return;
		const points = { ...participant.points };
		points.rating = (points.rating ?? 0) + AGORA_POINTS.RATING_CREDIT;
		points.total += AGORA_POINTS.RATING_CREDIT;
		transaction.update(raterRef, {
			points,
			creditedRatings: credited + 1,
			lastActive: Date.now(),
		});
	});
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

			// A brand-new rating (not an edit of one) earns the evaluation
			// credit — non-blocking, and never fatal to the bridging update
			if (!before && after) {
				await creditRatingEffort(sessionId, evaluatorId).catch((creditError: unknown) => {
					logError(creditError, {
						operation: 'agora.onEvaluationWritten.creditRating',
						userId: evaluatorId,
					});
				});
			}

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
			const campCounts = await readCampCounts(sessionId);

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
					crossCampPool: crossCampPoolFor(score.authorCamp, campCounts),
				});
				score.lastUpdate = Date.now();

				// The ladder is graduated and MONOTONIC: a later dip never claws a
				// tier back, so an author is never punished for a proposal that
				// moved. Sessions predating the tiers read their old boolean guard
				// as "tier 2 already paid".
				const alreadyAwarded = score.bridgingTierAwarded ?? (score.bridgingCreditAwardedAt ? 2 : 0);
				const reachedTier = bridgingTierFor(score.bridgingScore);
				const bonus = bridgingPayout(reachedTier) - bridgingPayout(alreadyAwarded);
				if (reachedTier > alreadyAwarded) {
					score.bridgingTierAwarded = reachedTier;
					if (reachedTier >= 2 && !score.bridgingCreditAwardedAt) {
						score.bridgingCreditAwardedAt = Date.now();
					}
				}

				transaction.set(scoreRef, score);

				return reachedTier > alreadyAwarded ? { score, tier: reachedTier, bonus } : null;
			});

			// Bridging bonus for the author — once per tier, per proposal
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
						points.proposals += authorToCredit.bonus;
						points.total += authorToCredit.bonus;
						transaction.update(authorRef, { points, lastActive: Date.now() });
					});

					// The author's biggest reward used to be paid in total silence —
					// a student could bridge the camps and never learn it happened.
					// Aggregate by construction: the trigger is a threshold on the
					// bridging score, so no individual's rating is ever revealed.
					const notificationId = getRandomUID();
					await db
						.collection(Collections.inAppNotifications)
						.doc(notificationId)
						.set({
							notificationId,
							userId: creatorId,
							parentId: statementId,
							statementId,
							statementType: StatementType.option,
							text:
								authorToCredit.tier >= 2
									? 'Your proposal bridged the camps!'
									: 'Your proposal reached across the camps!',
							creatorId,
							creatorName: 'The square',
							sourceApp: SourceApp.AGORA,
							triggerType: NotificationTriggerType.AGORA_BRIDGING_ACHIEVED,
							targetPath: `/play/${sessionId}`,
							pointsAwarded: authorToCredit.bonus,
							bridgingTier: authorToCredit.tier,
							read: false,
							createdAt: Date.now(),
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
