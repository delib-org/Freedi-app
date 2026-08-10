import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCamp,
	AgoraCampAggregate,
	AgoraParticipant,
	AgoraProposalScore,
	AgoraRatingDist,
	Evaluation,
	AGORA_BRIDGING,
	AGORA_POINTS,
	NotificationTriggerType,
	StatementType,
	bridgingPayout,
	bridgingTierFor,
	agoraRatingBucket,
	calcAgoraClassConsensus,
	calcBridgingScore,
	emptyDist,
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
	/** Student histogram delta, index 0 = -1 … 4 = +1. All zeros for AI raters. */
	studentDist: AgoraRatingDist;
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

interface CampCensus {
	counts: CampCounts;
	/** uid → camp for positioned, non-AI students. Free from the same query. */
	campOf: Map<string, AgoraCamp>;
}

async function readCampCensus(sessionId: string): Promise<CampCensus> {
	const snapshot = await db
		.collection(Collections.agoraParticipants)
		.where('sessionId', '==', sessionId)
		.get();

	const counts: CampCounts = { left: 0, right: 0, center: 0 };
	const campOf = new Map<string, AgoraCamp>();
	snapshot.forEach((docSnap) => {
		const participant = docSnap.data() as AgoraParticipant;
		if (participant.isAI) return; // synthetic raters never size the pool
		if (participant.camp === AgoraCamp.left) counts.left++;
		else if (participant.camp === AgoraCamp.right) counts.right++;
		else if (participant.camp === AgoraCamp.center) counts.center++;
		else return;
		campOf.set(participant.userId, participant.camp);
	});

	return { counts, campOf };
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
	const base = aggregate.studentDist ?? emptyDist();

	return {
		sum: aggregate.sum + delta.sum,
		n: aggregate.n + delta.n,
		positiveN: aggregate.positiveN + delta.positiveN,
		// Counts are integers and can never be negative. A re-delivered trigger
		// is clamped here rather than permanently poisoning the variance — the
		// repair a running sum-of-squares could not offer, because nothing about
		// a corrupted one looks wrong.
		studentDist: base.map((count, index) =>
			Math.max(0, count + delta.studentDist[index]),
		) as AgoraRatingDist,
	};
}

function emptyAggregate(): AgoraCampAggregate {
	return { sum: 0, n: 0, positiveN: 0, studentDist: emptyDist() };
}

/**
 * Who COULD have rated this proposal: positioned students, minus the author.
 * The square never serves anyone their own text, so counting the author would
 * make a full class look permanently one rating short of a census.
 *
 * AI raters are already absent — readCampCounts drops them — which is also why
 * they must stay out of the student histogram: numerator and denominator have
 * to be defined over the same set of people.
 */
export function eligiblePoolFor(
	score: Pick<AgoraProposalScore, 'authorCamp' | 'authorPositioned'>,
	census: CampCounts,
): CampCounts {
	if (!score.authorPositioned) return census;

	return {
		...census,
		[score.authorCamp]: Math.max(0, census[score.authorCamp] - 1),
	};
}

/**
 * Rebuild a proposal's student histogram from the evaluations themselves.
 *
 * Sessions already in flight have score docs with no histogram, and a delta
 * cannot be applied to something that was never counted. Rather than a
 * migration script, the first rating after this ships rebuilds that one
 * proposal exactly — inside the same transaction, so it cannot half-happen.
 *
 * The triggering evaluation is ALREADY in this query result, so the caller must
 * skip the delta when it rebuilds. Applying both would count that rating twice.
 */
async function rebuildStudentDists(
	transaction: Transaction,
	sessionId: string,
	statementId: string,
	campOf: Map<string, AgoraCamp>,
): Promise<Record<AgoraCamp, AgoraRatingDist>> {
	const snapshot = await transaction.get(
		db
			.collection(Collections.evaluations)
			.where('agoraSessionId', '==', sessionId)
			.where('statementId', '==', statementId),
	);

	const dists: Record<AgoraCamp, AgoraRatingDist> = {
		[AgoraCamp.left]: emptyDist(),
		[AgoraCamp.right]: emptyDist(),
		[AgoraCamp.center]: emptyDist(),
	};

	snapshot.forEach((docSnap) => {
		const evaluation = docSnap.data() as Evaluation;
		if (isAgoraAiUid(evaluation.evaluatorId)) return;
		const camp = campOf.get(evaluation.evaluatorId);
		if (!camp) return; // unpositioned students never entered the numerator
		dists[camp][agoraRatingBucket(evaluation.evaluation)] += 1;
	});

	return dists;
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
			// The characters' synthetic raters keep moving sum/n/positiveN — the
			// bridging score wants their weight — but never the class histogram.
			// They are not members of the class whose population N counts, and
			// their values are off-grid anyway (a score of 33 becomes -0.34),
			// so no five-level histogram could hold them honestly.
			const studentDist = emptyDist();
			if (!isAgoraAiUid(evaluatorId)) {
				if (beforeValue !== null) studentDist[agoraRatingBucket(beforeValue)] -= 1;
				if (afterValue !== null) studentDist[agoraRatingBucket(afterValue)] += 1;
			}
			const delta: CampDelta = {
				sum: (afterValue ?? 0) - (beforeValue ?? 0),
				n: (afterValue !== null ? 1 : 0) - (beforeValue !== null ? 1 : 0),
				positiveN:
					(afterValue !== null && afterValue > 0 ? 1 : 0) -
					(beforeValue !== null && beforeValue > 0 ? 1 : 0),
				studentDist,
			};
			if (
				delta.sum === 0 &&
				delta.n === 0 &&
				delta.positiveN === 0 &&
				studentDist.every((count) => count === 0)
			) {
				return;
			}

			const scoreRef = db.collection(Collections.agoraScores).doc(statementId);
			const { counts: campCounts, campOf } = await readCampCensus(sessionId);

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
					let authorPositioned = false;
					if (creatorId) {
						const authorSnap = await transaction.get(
							db
								.collection(Collections.agoraParticipants)
								.doc(createAgoraParticipantId(sessionId, creatorId)),
						);
						const author = authorSnap.data() as AgoraParticipant | undefined;
						authorCamp = author?.camp ?? AgoraCamp.center;
						authorPositioned = Boolean(author?.camp && !author.isAI);
					}
					score = {
						statementId,
						sessionId,
						authorCamp,
						authorPositioned,
						perCamp: {
							left: emptyAggregate(),
							right: emptyAggregate(),
							center: emptyAggregate(),
						},
						bridgingScore: 0,
						lastUpdate: Date.now(),
					};
				}

				// A session already in flight has a score doc with no histogram,
				// and a delta cannot be applied to something never counted. The
				// first rating after this ships rebuilds that one proposal from
				// its evaluations — no migration script, no downtime.
				//
				// The triggering evaluation is already in that query result, so
				// the delta MUST be skipped when we rebuild, or the rating that
				// caused the rebuild gets counted twice.
				const needsRebuild = !score.perCamp[evaluatorCamp].studentDist;
				if (needsRebuild) {
					const rebuilt = await rebuildStudentDists(transaction, sessionId, statementId, campOf);
					for (const camp of [AgoraCamp.left, AgoraCamp.right, AgoraCamp.center]) {
						score.perCamp[camp] = {
							...score.perCamp[camp],
							studentDist: rebuilt[camp],
						};
					}
					// sum/n/positiveN stay on their running totals: they include the
					// AI raters this rebuild deliberately excludes, so recomputing
					// them from students alone would silently drop that weight out
					// of the bridging score.
					score.perCamp[evaluatorCamp] = {
						...score.perCamp[evaluatorCamp],
						sum: score.perCamp[evaluatorCamp].sum + delta.sum,
						n: score.perCamp[evaluatorCamp].n + delta.n,
						positiveN: score.perCamp[evaluatorCamp].positiveN + delta.positiveN,
					};
				} else {
					score.perCamp[evaluatorCamp] = applyDelta(score.perCamp[evaluatorCamp], delta);
				}

				score.bridgingScore = calcBridgingScore({
					authorCamp: score.authorCamp,
					perCamp: score.perCamp,
					crossCampPool: crossCampPoolFor(score.authorCamp, campCounts),
				});
				// The class's own reading of this proposal, finite-population
				// corrected against the students who could have rated it.
				const classConsensus = calcAgoraClassConsensus({
					perCamp: score.perCamp,
					eligible: eligiblePoolFor(score, campCounts),
				});
				if (classConsensus) score.classConsensus = classConsensus;
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
