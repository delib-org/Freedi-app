import { db } from '../db';
import {
	Collections,
	AgoraCamp,
	AgoraClassScore,
	AgoraDebrief,
	AgoraHealthMetricOutcome,
	AgoraOutcomeStats,
	AgoraParticipant,
	AgoraPlausibility,
	AgoraProposalScore,
	AgoraSession,
	AgoraSessionOutcome,
	AgoraTopicPackage,
	AGORA_SESSION,
	Evaluation,
	Vote,
	deriveAgoraOutcome,
	isAgoraAiUid,
	pickVoteWinner,
	tallyVotes,
	ballotTallyIds,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, TAXONOMY_MODEL } from '../config/openai-chat';

export interface ProposalRow {
	statementId: string;
	text: string;
	/** The shared consensus metric (Cp) as it stands on the statement doc */
	consensus: number;
}

/** What the recap says about the election, when one was held */
type VoteFields = Pick<
	AgoraClassScore,
	| 'voteWinnerStatementId'
	| 'voteCounts'
	| 'voteTotal'
	| 'voteWinnerMetThreshold'
	| 'winningConsensusThreshold'
	| 'voteConsensus'
	| 'voteRejected'
>;

export interface VoteOutcome extends VoteFields {
	/** The proposal that should lead the recap, when the vote earned it that place */
	electedProposal?: ProposalRow;
}

/**
 * Counts the vote, if one was held.
 *
 * Votes are read from the votes collection rather than from the question's
 * `selections` tallies: the tallies are maintained by a trigger, and a vote
 * cast a moment before the teacher advanced may not have been counted there
 * yet. Reading the source of truth errs toward counting a real vote.
 */
export async function computeVoteOutcome(
	session: AgoraSession,
	proposals: ProposalRow[],
): Promise<VoteOutcome> {
	const candidateIds = session.voting?.candidateIds ?? [];
	// No ballot means no election was held — the recap must carry no vote
	// fields at all, so a skipped stage reads differently from an empty one.
	if (candidateIds.length === 0) return {};

	const votesSnap = await db
		.collection(Collections.votes)
		.where('parentId', '==', session.challengeQuestionId)
		.get();
	const votes = votesSnap.docs.map((docSnap) => {
		const vote = docSnap.data() as Vote;

		return { statementId: String(vote.statementId), userId: String(vote.userId) };
	});

	// A one-candidate ballot carries its against side in the tally
	const counts = tallyVotes(votes, ballotTallyIds(candidateIds));
	const consensusById = Object.fromEntries(
		proposals.map((proposal) => [proposal.statementId, proposal.consensus]),
	);
	const threshold = session.votingSettings?.winningConsensusThreshold;
	const { winnerStatementId, metThreshold, total, rejected } = pickVoteWinner(
		counts,
		consensusById,
		threshold,
	);

	// The consensus each candidate held at THIS moment — the numbers the
	// threshold was actually judged against. Stored so the results screen can
	// explain the verdict with the deciding figure instead of the frozen
	// ballot snapshot's, which stopped moving when the stage opened.
	const voteConsensus = Object.fromEntries(
		candidateIds
			.filter((candidateId) => consensusById[candidateId] !== undefined)
			.map((candidateId) => [candidateId, consensusById[candidateId]]),
	);

	// A winner that misses the bar is still named — the class elected it, and
	// the screen has to say what happened — but it does not take the crown.
	const electedProposal =
		winnerStatementId && metThreshold
			? proposals.find((proposal) => proposal.statementId === winnerStatementId)
			: undefined;

	return {
		...(winnerStatementId ? { voteWinnerStatementId: winnerStatementId } : {}),
		voteCounts: counts,
		voteTotal: total,
		voteWinnerMetThreshold: metThreshold,
		...(rejected !== undefined ? { voteRejected: rejected } : {}),
		voteConsensus,
		...(threshold !== undefined ? { winningConsensusThreshold: threshold } : {}),
		...(electedProposal ? { electedProposal } : {}),
	};
}

/** What the recap says about the proposal that led, when one did */
type LeadFields = Pick<AgoraClassScore, 'leadStatementId' | 'leadConsensus' | 'leadCoverage'>;

/**
 * The lead proposal's three optional fields — present together, or not at all.
 *
 * A lesson that ends without a rated proposal has no lead, and an `undefined`
 * anywhere inside a write makes Firestore reject the whole batch. That used to
 * sink the entire recap: no classScore was ever written, the error was logged
 * and swallowed, and every student sat on "computing the fate of the realm"
 * until the tab was closed. Omit the keys instead of writing them empty.
 */
export function leadFields(
	leadProposal: ProposalRow | undefined,
	leadConsensus: { consensus: number; n: number; eligible: number } | undefined,
): LeadFields {
	return {
		...(leadProposal ? { leadStatementId: leadProposal.statementId } : {}),
		...(leadConsensus
			? {
					leadConsensus: leadConsensus.consensus,
					leadCoverage: { rated: leadConsensus.n, eligible: leadConsensus.eligible },
				}
			: {}),
	};
}

interface PlausibilityRow {
	statementId: string;
	score: number;
	criterionScores: Array<{ criterionId: string; score: number }>;
	reasoning: string;
}

interface AiResultsPayload {
	proposals: PlausibilityRow[];
	healthMetrics: Array<{ metricId: string; value: number; narrative: string }>;
	debrief: AgoraDebrief;
}

/**
 * How thoroughly the class mapped the divergence — computed from STUDENT
 * evaluations only. AI character raters are excluded, otherwise asking both
 * characters would trivially count as "rated by both camps".
 */
export function computeOutcomeStats(
	evaluations: Evaluation[],
	participants: AgoraParticipant[],
): AgoraOutcomeStats {
	const campByUid = new Map(
		participants
			.filter((participant) => !participant.isAI && participant.camp)
			.map((participant) => [participant.userId, participant.camp]),
	);
	const campsByStatement = new Map<string, Set<AgoraCamp>>();
	const raterUids = new Set<string>();

	for (const evaluation of evaluations) {
		if (isAgoraAiUid(evaluation.evaluatorId)) continue;
		const camp = campByUid.get(evaluation.evaluatorId);
		if (!camp) continue;
		raterUids.add(evaluation.evaluatorId);
		const camps = campsByStatement.get(evaluation.statementId) ?? new Set<AgoraCamp>();
		camps.add(camp);
		campsByStatement.set(evaluation.statementId, camps);
	}

	let crossRatedProposals = 0;
	for (const camps of campsByStatement.values()) {
		if (camps.has(AgoraCamp.left) && camps.has(AgoraCamp.right)) crossRatedProposals++;
	}

	const positionedStudents = campByUid.size;
	const raterCoverage = positionedStudents > 0 ? raterUids.size / positionedStudents : 0;

	return { crossRatedProposals, raterCoverage };
}

/** Deterministic fixture for emulators/e2e/CI (no OPENAI_API_KEY) */
function fixtureResults(
	proposals: ProposalRow[],
	topic: AgoraTopicPackage,
	leadBridging: number,
): AiResultsPayload {
	return {
		proposals: proposals.map((proposal) => ({
			statementId: proposal.statementId,
			score: Math.min(100, 40 + Math.min(40, Math.floor(proposal.text.length / 10)) + 10),
			criterionScores: topic.plausibilityRubric.criteria.map((criterion) => ({
				criterionId: criterion.criterionId,
				score: 70,
			})),
			reasoning: 'הערכת דמה (מצב פיתוח): ההצעה סבירה לתקופה.',
		})),
		healthMetrics: topic.healthMetrics.map((metric) => ({
			metricId: metric.metricId,
			value: Math.min(
				metric.max,
				Math.round(metric.baseline + ((metric.max - metric.baseline) * leadBridging) / 100),
			),
			narrative: 'הערכת דמה: הפתרון המוביל משפר את המדד.',
		})),
		debrief: {
			whatWentWell: [
				'הצעתם פתרונות ובחנתם הצעות של אחרים — כך נראית היוועצות אמיתית.',
				'חלק מההצעות זכו לתמיכה גם מהמחנה השני.',
			],
			whatToTryNextTime: [
				'נסו לנסח כיצד ההצעה עונה על הצרכים של שני הצדדים, לא רק של הצד שלכם.',
				'דרגו יותר הצעות של חבריכם — הסכמה נבנית מהערכות.',
			],
			encouragement: 'מחלוקת כנה היא הישג בפני עצמה — ומנהרת הזמן נשארת פתוחה.',
		},
	};
}

async function aiResults(
	proposals: ProposalRow[],
	topic: AgoraTopicPackage,
	leadProposal: ProposalRow | undefined,
	deliberationStats: { maxBridging: number; outcomeStats: AgoraOutcomeStats },
): Promise<AiResultsPayload> {
	const rubric = topic.plausibilityRubric.criteria
		.map(
			(criterion) =>
				`- ${criterion.criterionId}: ${criterion.label} (${criterion.description}, weight ${criterion.weight})`,
		)
		.join('\n');
	const metrics = topic.healthMetrics
		.map(
			(metric) =>
				`- ${metric.metricId}: ${metric.label} (${metric.description}), baseline ${metric.baseline}, range ${metric.min}-${metric.max}`,
		)
		.join('\n');
	const proposalList = proposals
		.map((proposal) => `[${proposal.statementId}] ${proposal.text}`)
		.join('\n\n');

	const system = `You evaluate student solution proposals in a classroom history game about "${topic.title}". Respond ONLY with JSON:
{"proposals": [{"statementId": string, "score": 0-100, "criterionScores": [{"criterionId": string, "score": 0-100}], "reasoning": string}], "healthMetrics": [{"metricId": string, "value": number, "narrative": string}], "debrief": {"whatWentWell": string[], "whatToTryNextTime": string[], "encouragement": string}}
Score each proposal for HISTORICAL PLAUSIBILITY against the rubric (score = weighted total). reasoning: 1 sentence in language "${topic.language}".
healthMetrics: simulate what happens to each national metric if the LEADING proposal were adopted in the period; value inside the metric's range; narrative: 1 vivid sentence in language "${topic.language}".
debrief: a warm, formative class debrief in language "${topic.language}", grounded in the deliberation stats you are given. 2-3 whatWentWell items praising real behavior (proposing, rating across camps, improving each other's ideas), 2-3 whatToTryNextTime items with concrete deliberation moves (address the other camp's needs, rate more proposals, improve rather than dismiss), and 1 encouragement sentence. Never shaming — honest disagreement is itself an achievement. Do not declare victory or defeat.`;

	const user = `Rubric:\n${rubric}\n\nNational health metrics:\n${metrics}\n\nLeading proposal: ${leadProposal ? `[${leadProposal.statementId}]` : '(none)'}\n\nDeliberation stats: best bridging score ${deliberationStats.maxBridging}/100; ${deliberationStats.outcomeStats.crossRatedProposals} proposals rated by both camps; ${Math.round(deliberationStats.outcomeStats.raterCoverage * 100)}% of positioned students rated proposals.\n\nProposals:\n${proposalList}`;

	const raw = await callLLM({
		model: TAXONOMY_MODEL,
		system,
		user,
		maxTokens: 2500,
		temperature: 0.3,
		jsonMode: true,
	});

	return JSON.parse(extractJson(raw)) as AiResultsPayload;
}

/**
 * Computes the end-of-lesson results: AI plausibility per proposal (one
 * batched call), simulated health metrics for the leading proposal, and
 * the collective class score. Writes plausibility onto agoraScores docs
 * and the class score onto the session doc.
 */
export async function computeSessionResults(sessionId: string): Promise<void> {
	try {
		const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
		if (!sessionSnap.exists) return;
		const session = sessionSnap.data() as AgoraSession;

		const topicSnap = await db
			.collection(Collections.agoraTopicPackages)
			.doc(session.topicPackageId)
			.get();
		if (!topicSnap.exists) return;
		const topic = topicSnap.data() as AgoraTopicPackage;

		const [proposalsSnap, scoresSnap, participantsSnap, evaluationsSnap] = await Promise.all([
			db
				.collection(Collections.statements)
				.where('agoraSessionId', '==', sessionId)
				.where('statementType', '==', 'option')
				.get(),
			db.collection(Collections.agoraScores).where('sessionId', '==', sessionId).get(),
			db.collection(Collections.agoraParticipants).where('sessionId', '==', sessionId).get(),
			db.collection(Collections.evaluations).where('agoraSessionId', '==', sessionId).get(),
		]);

		// Only the challenge question's options are proposals. A question
		// stage's answers are options too — under their own question — and
		// must never be plausibility-scored or compete for the lead.
		const proposals: ProposalRow[] = proposalsSnap.docs
			.filter((docSnap) => docSnap.data().parentId === session.challengeQuestionId)
			.map((docSnap) => ({
				statementId: String(docSnap.data().statementId),
				text: String(docSnap.data().statement ?? ''),
				consensus: Number(docSnap.data().consensus ?? 0),
			}));
		const scores = new Map<string, AgoraProposalScore>(
			scoresSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() as AgoraProposalScore]),
		);
		const participants = participantsSnap.docs.map((docSnap) => docSnap.data() as AgoraParticipant);
		// The characters' synthetic rater identities never count as students
		const students = participants.filter((participant) => !participant.isAI);
		const evaluations = evaluationsSnap.docs
			.map((docSnap) => docSnap.data() as Evaluation)
			.filter((evaluation) => evaluation.parentId === session.challengeQuestionId);
		const outcomeStats = computeOutcomeStats(evaluations, participants);

		const maxBridging = Math.max(
			0,
			...proposals.map((proposal) => scores.get(proposal.statementId)?.bridgingScore ?? 0),
		);

		// The crown is the class's own consensus, not the bridging score. A
		// proposal leads because the class agrees with it, and `normalized`
		// rather than raw C_p is what the threshold judges: a student's rating
		// budget is fixed, so coverage — and with it raw consensus — falls as
		// the class grows. Without normalising, the same class sentiment would
		// pass in a class of six and be unreachable in a class of forty.
		const consensusOf = (statementId: string): number =>
			scores.get(statementId)?.classConsensus?.consensus ?? Number.NEGATIVE_INFINITY;
		const consensusLeader = proposals.reduce<ProposalRow | undefined>((best, candidate) => {
			if (!best)
				return consensusOf(candidate.statementId) > Number.NEGATIVE_INFINITY ? candidate : best;

			return consensusOf(candidate.statementId) > consensusOf(best.statementId) ? candidate : best;
		}, undefined);

		// A class that voted has already answered "which proposal leads", and its
		// answer outranks the consensus reading — but only if the winner cleared
		// the bar the teacher set. Resolved BEFORE the AI call so the health
		// metrics simulate the proposal the class actually elected.
		const { electedProposal, ...voteFields } = await computeVoteOutcome(session, proposals);
		const leadProposal = electedProposal ?? consensusLeader;
		const leadConsensus = leadProposal
			? scores.get(leadProposal.statementId)?.classConsensus
			: undefined;
		// Sessions scored before class consensus existed have no histogram, so
		// fall back to the bridging reading rather than reporting a zero the
		// class never earned.
		const consensusTerm =
			leadConsensus !== undefined ? Math.round(100 * leadConsensus.normalized) : maxBridging;

		const results =
			process.env.OPENAI_API_KEY && proposals.length > 0
				? await aiResults(proposals, topic, leadProposal, { maxBridging, outcomeStats })
				: fixtureResults(proposals, topic, maxBridging);

		// Write plausibility onto each score doc
		const batch = db.batch();
		const now = Date.now();
		const validIds = new Set(proposals.map((proposal) => proposal.statementId));
		let plausibilitySum = 0;
		let plausibilityCount = 0;
		for (const row of results.proposals) {
			if (!validIds.has(row.statementId)) continue;
			const plausibility: AgoraPlausibility = {
				score: Math.max(0, Math.min(100, Math.round(row.score))),
				criterionScores: (row.criterionScores ?? []).map((criterion) => ({
					criterionId: criterion.criterionId,
					score: Math.max(0, Math.min(100, Math.round(criterion.score))),
				})),
				reasoning: row.reasoning ?? '',
				scoredAt: now,
			};
			plausibilitySum += plausibility.score;
			plausibilityCount++;
			const existing = scores.get(row.statementId);
			const scoreRef = db.collection(Collections.agoraScores).doc(row.statementId);
			if (existing) {
				batch.update(scoreRef, { plausibility, lastUpdate: now });
			} else {
				batch.set(scoreRef, {
					statementId: row.statementId,
					sessionId,
					authorCamp: 'center',
					perCamp: {
						left: { sum: 0, n: 0, positiveN: 0 },
						right: { sum: 0, n: 0, positiveN: 0 },
						center: { sum: 0, n: 0, positiveN: 0 },
					},
					bridgingScore: 0,
					plausibility,
					lastUpdate: now,
				});
			}
		}

		const avgPlausibility =
			plausibilityCount > 0 ? Math.round(plausibilitySum / plausibilityCount) : 0;
		const personalPointsSum = students.reduce(
			(sum, participant) => sum + participant.points.total,
			0,
		);
		const avgPoints = students.length > 0 ? personalPointsSum / students.length : 0;

		const healthMetricOutcomes: AgoraHealthMetricOutcome[] = topic.healthMetrics.map((metric) => {
			const outcome = results.healthMetrics.find(
				(candidate) => candidate.metricId === metric.metricId,
			);

			return {
				metricId: metric.metricId,
				value: Math.max(
					metric.min,
					Math.min(metric.max, Math.round(outcome?.value ?? metric.baseline)),
				),
				narrative: outcome?.narrative ?? '',
			};
		});

		const total = Math.round(
			0.45 * consensusTerm + 0.25 * Math.min(100, avgPoints) + 0.3 * avgPlausibility,
		);
		const outcome = deriveAgoraOutcome({
			total,
			threshold: AGORA_SESSION.SUCCESS_THRESHOLD,
			crossRatedProposals: outcomeStats.crossRatedProposals,
			raterCoverage: outcomeStats.raterCoverage,
		});
		const debrief: AgoraDebrief = {
			whatWentWell: (results.debrief?.whatWentWell ?? []).filter(
				(entry): entry is string => typeof entry === 'string',
			),
			whatToTryNextTime: (results.debrief?.whatToTryNextTime ?? []).filter(
				(entry): entry is string => typeof entry === 'string',
			),
			encouragement:
				typeof results.debrief?.encouragement === 'string' ? results.debrief.encouragement : '',
		};
		const classScore: AgoraClassScore = {
			maxConsensus: consensusTerm,
			...leadFields(leadProposal, leadConsensus),
			...voteFields,
			personalPointsSum,
			avgPlausibility,
			total,
			threshold: AGORA_SESSION.SUCCESS_THRESHOLD,
			success: outcome === AgoraSessionOutcome.success,
			outcome,
			outcomeStats,
			debrief,
			healthMetricOutcomes,
			computedAt: now,
		};

		batch.update(db.collection(Collections.agoraSessions).doc(sessionId), {
			classScore,
			lastUpdate: now,
		});
		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'agora.computeSessionResults',
			metadata: { sessionId },
		});
	}
}
