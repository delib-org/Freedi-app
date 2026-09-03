import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCamp,
	AgoraParticipant,
	AgoraProposalScore,
	AgoraRatingDist,
	AgoraSession,
	AgoraStage,
	Evaluation,
	AGORA_POINTS,
	NotificationTriggerType,
	StatementType,
	currentPlanIndex,
	evaluateVotingTrigger,
	resolveStagePlan,
	bridgingPayout,
	bridgingTierFor,
	agoraRatingBucket,
	calcAgoraClassConsensus,
	calcBridgingScore,
	consensusPoolFrom,
	crossCampPoolFor,
	eligiblePoolFor,
	emptyDist,
	createAgoraParticipantId,
	functionConfig,
	getRandomUID,
	isAgoraAiUid,
	tallyAgoraCamps,
	isAgoraHidden,
	ModeratedDoc,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { awardCredit } from '../engagement/credits/creditEngine';
import { CreditAction, SourceApp } from '@freedi/shared-types';
import { advanceSession } from './stageAdvance';

/**
 * The deliberation → voting auto-open. Runs after this rating's score has
 * committed, with the session as it was read at the start of the trigger:
 * a stale `stage` here only means `advanceSession` refuses the move, which
 * is exactly what a second in-flight rating should get.
 *
 * The sibling scores are read AFTER our own commit, and our own doc is
 * replaced by the score just computed, so the last rating to land cannot
 * read a neighbour's score from before its transaction and miss the bar
 * with no later write left to retry. The teacher's own "open next" button
 * stays the backstop for a trigger that never ran.
 */
async function maybeAutoOpenVoting(
	session: AgoraSession,
	fresh: AgoraProposalScore,
): Promise<void> {
	if (session.stage !== AgoraStage.deliberation) return;
	const plan = resolveStagePlan(session);
	const index = currentPlanIndex(session);
	const rule = plan[index]?.votingTrigger;
	if (!rule?.enabled) return;
	if (plan[index + 1]?.stage !== AgoraStage.voting) return;

	const scoresSnap = await db
		.collection(Collections.agoraScores)
		.where('sessionId', '==', session.sessionId)
		.get();
	const scores = new Map<string, AgoraProposalScore>(
		scoresSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() as AgoraProposalScore]),
	);
	scores.set(fresh.statementId, fresh);

	const verdict = evaluateVotingTrigger(
		Array.from(scores.values())
			.filter((score) => score.hidden !== true)
			.map((score) => ({
				statementId: score.statementId,
				mean: score.classConsensus?.mean ?? 0,
				n: score.classConsensus?.n ?? 0,
			})),
		rule,
	);
	if (!verdict.fired) return;

	const result = await advanceSession(
		session.sessionId,
		{ toIndex: index + 1 },
		{ kind: 'system' },
		{ trigger: { mode: verdict.mode, candidateIds: verdict.candidateIds } },
	);
	// `stale` is the normal fate of every rating but the first to fire
	if (!result.ok && result.reason !== 'stale') {
		logError(new Error(`auto-open voting refused: ${result.reason}`), {
			operation: 'agora.onEvaluationWritten.autoOpenVoting',
			metadata: { sessionId: session.sessionId },
		});
	}
}

/**
 * One camp's tallies while a proposal is being recounted. Same shape as the
 * stored aggregate, minus the optionality — a freshly counted camp always has
 * a histogram, and making that explicit keeps the counting loop honest.
 */
interface CampTally {
	sum: number;
	n: number;
	positiveN: number;
	/** Student histogram, index 0 = -1 … 4 = +1. AI raters never appear here. */
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

/**
 * The class, counted two ways, because two different questions are asked of it.
 *
 * `counts` is POSITIONED students per camp — the bridging denominator, which is
 * meaningless for a student whose side nobody knows.
 * `unpositioned` is the rest of the class. They can still rate, so they are
 * still part of the population the class consensus divides by; leaving them out
 * made a proposal read "1 of 0 rated".
 */
interface CampCensus {
	counts: CampCounts;
	/** Class members who never placed themselves on the scale */
	unpositioned: number;
	/**
	 * uid → camp for everyone who HAS one, the characters' synthetic raters
	 * included. Free from the same query, and the only thing the recount needs
	 * to sort a proposal's evaluations into camps. AI raters are in the map but
	 * never in `counts`: they carry a camp's weight without sizing the class.
	 */
	campOf: Map<string, AgoraCamp>;
}

async function readCampCensus(sessionId: string): Promise<CampCensus> {
	const snapshot = await db
		.collection(Collections.agoraParticipants)
		.where('sessionId', '==', sessionId)
		.get();

	const participants: AgoraParticipant[] = [];
	const campOf = new Map<string, AgoraCamp>();
	snapshot.forEach((docSnap) => {
		const participant = docSnap.data() as AgoraParticipant;
		if (participant.camp) campOf.set(participant.userId, participant.camp);
		participants.push(participant);
	});

	// The counting itself is shared with the client, which reads the same tally
	// to show a live consensus before this trigger lands.
	const { counts, unpositioned } = tallyAgoraCamps(participants);

	return { counts, unpositioned, campOf };
}

/**
 * Credit the evaluator for doing the work the whole game depends on.
 * Value-blind (identical for "strongly against" and "strongly for") and
 * first-rating-only, so there is no incentive to rate in any direction or
 * to toggle a rating for points.
 *
 * Idempotent PER EVALUATION via a stamp on the evaluation doc itself, read
 * and checked in the same transaction — the same pattern as
 * `creditFirstProposal`'s stamp on the participant. The cap alone is not a
 * guard: a redelivered create event used to pass `credited < cap` again and
 * pay the same rating twice.
 */
async function creditRatingEffort(
	sessionId: string,
	evaluatorId: string,
	evaluationId: string,
): Promise<void> {
	if (isAgoraAiUid(evaluatorId)) return;
	const raterRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, evaluatorId));
	const evaluationRef = db.collection(Collections.evaluations).doc(evaluationId);

	await db.runTransaction(async (transaction) => {
		const [snap, evaluationSnap] = await Promise.all([
			transaction.get(raterRef),
			transaction.get(evaluationRef),
		]);
		if (!snap.exists || !evaluationSnap.exists) return;
		// This very evaluation already paid — a redelivered trigger, not a new rating
		if (evaluationSnap.data()?.agoraEffortCredited === true) return;
		transaction.update(evaluationRef, { agoraEffortCredited: true });

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

function emptyTally(): CampTally {
	return { sum: 0, n: 0, positiveN: 0, studentDist: emptyDist() };
}

/**
 * A proposal's per-camp aggregates, COUNTED FROM the evaluations rather than
 * nudged by a delta.
 *
 * The delta this replaces could not survive a rater whose camp arrived late.
 * A student who rated before placing themselves on the scale was skipped in
 * the bridging half (their side was unknown, and an unknown side cannot
 * support a claim about reaching across the camps) — and skipped is forever,
 * because the edit that follows carries a delta of n = 0. The class rated, the
 * bridging score stayed 0, and the improvement loop told the author "still 0 —
 * it hasn't moved yet" while their classmates were voting it up. Counting the
 * evaluations afresh each time makes that self-healing: the moment a camp is
 * known, every rating that student ever left is in the right column.
 *
 * It is also the cheaper kind of correct. One query per rating over one
 * proposal's evaluations is a classroom-sized read, and it retires the
 * histogram back-fill, the double-count guard around it, and the negative-count
 * clamp a running total needed to survive a re-delivered trigger.
 *
 * Two rules, unchanged from the delta path they replace:
 *   • the characters' synthetic raters move sum/n/positiveN but never the
 *     histogram — off-grid values (a score of 33 becomes -0.34) that no
 *     five-level bucket can hold, from raters who are not in the class
 *   • a student with no camp is counted in the histogram under center, so the
 *     class consensus still hears them, and left out of sum/n/positiveN, so
 *     bridging never claims a reach across camps nobody can locate
 */
export function tallyEvaluations(
	verdicts: Iterable<{ evaluatorId: string; value: number }>,
	campOf: Map<string, AgoraCamp>,
): Record<AgoraCamp, CampTally> {
	const perCamp: Record<AgoraCamp, CampTally> = {
		[AgoraCamp.left]: emptyTally(),
		[AgoraCamp.right]: emptyTally(),
		[AgoraCamp.center]: emptyTally(),
	};

	for (const { evaluatorId, value } of verdicts) {
		if (typeof value !== 'number' || Number.isNaN(value)) continue;
		const camp = campOf.get(evaluatorId);

		if (!isAgoraAiUid(evaluatorId)) {
			perCamp[camp ?? AgoraCamp.center].studentDist[agoraRatingBucket(value)] += 1;
		}

		if (camp === undefined) continue;
		const tally = perCamp[camp];
		tally.sum += value;
		tally.n += 1;
		if (value > 0) tally.positiveN += 1;
	}

	return perCamp;
}

/** The query half of the recount — see `tallyEvaluations` for the rules. */
async function recountPerCamp(
	transaction: Transaction,
	sessionId: string,
	statementId: string,
	campOf: Map<string, AgoraCamp>,
): Promise<Record<AgoraCamp, CampTally>> {
	const snapshot = await transaction.get(
		db
			.collection(Collections.evaluations)
			.where('agoraSessionId', '==', sessionId)
			.where('statementId', '==', statementId),
	);

	const verdicts = snapshot.docs.map((docSnap) => {
		const evaluation = docSnap.data() as Evaluation;

		return { evaluatorId: evaluation.evaluatorId, value: evaluation.evaluation };
	});

	return tallyEvaluations(verdicts, campOf);
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
			const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
			const session = sessionSnap.exists ? (sessionSnap.data() as AgoraSession) : null;

			// A brand-new rating (not an edit of one) earns the evaluation
			// credit — non-blocking, and never fatal to the bridging update.
			// Paid whether or not the rater is positioned: the credit is for the
			// labour of weighing a classmate's text, and it is camp-blind. Paid
			// for a question stage's answers too — weighing is weighing.
			if (!before && after) {
				await creditRatingEffort(sessionId, evaluatorId, event.params.evaluationId).catch(
					(creditError: unknown) => {
						logError(creditError, {
							operation: 'agora.onEvaluationWritten.creditRating',
							userId: evaluatorId,
						});
					},
				);
			}

			// Only the challenge question's proposals carry a bridging score. A
			// question stage's answers are rated through the same pipeline, but
			// their numbers are the statement's own evaluation block — no camps,
			// no synthetic raters, nothing for this engine to add.
			if (session && evaluation.parentId !== session.challengeQuestionId) return;

			const scoreRef = db.collection(Collections.agoraScores).doc(statementId);
			// Camps are server-authoritative and never taken from the client. Both
			// reads sit OUTSIDE the transaction on purpose: the proposal doc is
			// written by the generic evaluation pipeline on every rating, so
			// locking it here would make two students rating the same text fight
			// each other for no gain — a camp read a moment stale only nudges a
			// ramp, and the next rating re-reads it anyway.
			const [{ counts: campCounts, unpositioned, campOf }, proposalSnap] = await Promise.all([
				readCampCensus(sessionId),
				db.collection(Collections.statements).doc(statementId).get(),
			]);
			// Bridging asks about camps and gets the positioned counts only. The
			// class consensus asks "how much of the class has spoken", so it gets
			// the whole class — the unpositioned filed under centre, exactly where
			// their ratings are.
			const consensusPool: CampCounts = consensusPoolFrom({
				counts: campCounts,
				unpositioned,
			});

			/**
			 * The author's side, re-read every time rather than frozen at the
			 * moment of the proposal's first rating. An author who positions after
			 * being rated used to keep `center` for the rest of the lesson, which
			 * pointed the cross-camp half of their own bridging score at the wrong
			 * wing. Positioning is one-shot in the UI, so this can only ever go
			 * from unknown to known.
			 */
			// A text the teacher took down keeps the score it had: nothing moves,
			// nothing pays, until it is restored.
			if (isAgoraHidden(proposalSnap.data() as ModeratedDoc | undefined)) return;

			const creatorId = proposalSnap.data()?.creatorId as string | undefined;
			const authorSide = creatorId ? campOf.get(creatorId) : undefined;
			const authorCamp = authorSide ?? AgoraCamp.center;
			const authorPositioned = Boolean(authorSide && creatorId && !isAgoraAiUid(creatorId));

			const { score: freshScore, credit: authorToCredit } = await db.runTransaction(
				async (transaction) => {
					const scoreSnap = await transaction.get(scoreRef);
					const perCamp = await recountPerCamp(transaction, sessionId, statementId, campOf);
					const existing = scoreSnap.exists ? (scoreSnap.data() as AgoraProposalScore) : undefined;

					const score: AgoraProposalScore = {
						...existing,
						statementId,
						sessionId,
						authorCamp,
						authorPositioned,
						perCamp,
						bridgingScore: existing?.bridgingScore ?? 0,
						lastUpdate: Date.now(),
					};

					score.bridgingScore = calcBridgingScore({
						authorCamp: score.authorCamp,
						perCamp: score.perCamp,
						crossCampPool: crossCampPoolFor(score.authorCamp, campCounts),
					});
					// The class's own reading of this proposal, finite-population
					// corrected against the students who could have rated it.
					const classConsensus = calcAgoraClassConsensus({
						perCamp: score.perCamp,
						eligible: eligiblePoolFor(score, consensusPool),
					});
					if (classConsensus) score.classConsensus = classConsensus;

					// The ladder is graduated and MONOTONIC: a later dip never claws a
					// tier back, so an author is never punished for a proposal that
					// moved. Sessions predating the tiers read their old boolean guard
					// as "tier 2 already paid".
					const alreadyAwarded =
						score.bridgingTierAwarded ?? (score.bridgingCreditAwardedAt ? 2 : 0);
					const reachedTier = bridgingTierFor(score.bridgingScore);
					const bonus = bridgingPayout(reachedTier) - bridgingPayout(alreadyAwarded);
					if (reachedTier > alreadyAwarded) {
						score.bridgingTierAwarded = reachedTier;
						if (reachedTier >= 2 && !score.bridgingCreditAwardedAt) {
							score.bridgingCreditAwardedAt = Date.now();
						}
					}

					transaction.set(scoreRef, score);

					return {
						score,
						credit: reachedTier > alreadyAwarded ? { score, tier: reachedTier, bonus } : null,
					};
				},
			);

			if (session) await maybeAutoOpenVoting(session, freshScore);

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
