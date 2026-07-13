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
	deriveAgoraOutcome,
	isAgoraAiUid,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, TAXONOMY_MODEL } from '../config/openai-chat';

interface ProposalRow {
	statementId: string;
	text: string;
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

		const proposals: ProposalRow[] = proposalsSnap.docs.map((docSnap) => ({
			statementId: String(docSnap.data().statementId),
			text: String(docSnap.data().statement ?? ''),
		}));
		const scores = new Map<string, AgoraProposalScore>(
			scoresSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() as AgoraProposalScore]),
		);
		const participants = participantsSnap.docs.map((docSnap) => docSnap.data() as AgoraParticipant);
		// The characters' synthetic rater identities never count as students
		const students = participants.filter((participant) => !participant.isAI);
		const evaluations = evaluationsSnap.docs.map((docSnap) => docSnap.data() as Evaluation);
		const outcomeStats = computeOutcomeStats(evaluations, participants);

		const maxBridging = Math.max(
			0,
			...proposals.map((proposal) => scores.get(proposal.statementId)?.bridgingScore ?? 0),
		);
		const leadProposal = proposals.reduce<ProposalRow | undefined>((best, candidate) => {
			const bestScore = best ? (scores.get(best.statementId)?.bridgingScore ?? 0) : -1;
			const candidateScore = scores.get(candidate.statementId)?.bridgingScore ?? 0;

			return candidateScore > bestScore ? candidate : best;
		}, undefined);

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
			0.45 * maxBridging + 0.25 * Math.min(100, avgPoints) + 0.3 * avgPlausibility,
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
			maxConsensus: maxBridging,
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
