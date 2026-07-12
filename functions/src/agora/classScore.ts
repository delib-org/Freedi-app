import { db } from '../db';
import {
	Collections,
	AgoraClassScore,
	AgoraHealthMetricOutcome,
	AgoraParticipant,
	AgoraPlausibility,
	AgoraProposalScore,
	AgoraSession,
	AgoraTopicPackage,
	AGORA_SESSION,
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
}

/** Deterministic fixture for emulators/e2e/CI (no OPENAI_API_KEY) */
function fixtureResults(
	proposals: ProposalRow[],
	topic: AgoraTopicPackage,
	leadBridging: number
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
				Math.round(metric.baseline + ((metric.max - metric.baseline) * leadBridging) / 100)
			),
			narrative: 'הערכת דמה: הפתרון המוביל משפר את המדד.',
		})),
	};
}

async function aiResults(
	proposals: ProposalRow[],
	topic: AgoraTopicPackage,
	leadProposal: ProposalRow | undefined
): Promise<AiResultsPayload> {
	const rubric = topic.plausibilityRubric.criteria
		.map((criterion) => `- ${criterion.criterionId}: ${criterion.label} (${criterion.description}, weight ${criterion.weight})`)
		.join('\n');
	const metrics = topic.healthMetrics
		.map((metric) => `- ${metric.metricId}: ${metric.label} (${metric.description}), baseline ${metric.baseline}, range ${metric.min}-${metric.max}`)
		.join('\n');
	const proposalList = proposals
		.map((proposal) => `[${proposal.statementId}] ${proposal.text}`)
		.join('\n\n');

	const system = `You evaluate student solution proposals in a classroom history game about "${topic.title}". Respond ONLY with JSON:
{"proposals": [{"statementId": string, "score": 0-100, "criterionScores": [{"criterionId": string, "score": 0-100}], "reasoning": string}], "healthMetrics": [{"metricId": string, "value": number, "narrative": string}]}
Score each proposal for HISTORICAL PLAUSIBILITY against the rubric (score = weighted total). reasoning: 1 sentence in language "${topic.language}".
healthMetrics: simulate what happens to each national metric if the LEADING proposal were adopted in the period; value inside the metric's range; narrative: 1 vivid sentence in language "${topic.language}".`;

	const user = `Rubric:\n${rubric}\n\nNational health metrics:\n${metrics}\n\nLeading proposal: ${leadProposal ? `[${leadProposal.statementId}]` : '(none)'}\n\nProposals:\n${proposalList}`;

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

		const [proposalsSnap, scoresSnap, participantsSnap] = await Promise.all([
			db
				.collection(Collections.statements)
				.where('agoraSessionId', '==', sessionId)
				.where('statementType', '==', 'option')
				.get(),
			db.collection(Collections.agoraScores).where('sessionId', '==', sessionId).get(),
			db
				.collection(Collections.agoraParticipants)
				.where('sessionId', '==', sessionId)
				.get(),
		]);

		const proposals: ProposalRow[] = proposalsSnap.docs.map((docSnap) => ({
			statementId: String(docSnap.data().statementId),
			text: String(docSnap.data().statement ?? ''),
		}));
		const scores = new Map<string, AgoraProposalScore>(
			scoresSnap.docs.map((docSnap) => [
				docSnap.id,
				docSnap.data() as AgoraProposalScore,
			])
		);
		const participants = participantsSnap.docs.map(
			(docSnap) => docSnap.data() as AgoraParticipant
		);

		const maxBridging = Math.max(
			0,
			...proposals.map((proposal) => scores.get(proposal.statementId)?.bridgingScore ?? 0)
		);
		const leadProposal = proposals.reduce<ProposalRow | undefined>((best, candidate) => {
			const bestScore = best ? (scores.get(best.statementId)?.bridgingScore ?? 0) : -1;
			const candidateScore = scores.get(candidate.statementId)?.bridgingScore ?? 0;

			return candidateScore > bestScore ? candidate : best;
		}, undefined);

		const results =
			process.env.OPENAI_API_KEY && proposals.length > 0
				? await aiResults(proposals, topic, leadProposal)
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
		const personalPointsSum = participants.reduce(
			(sum, participant) => sum + participant.points.total,
			0
		);
		const avgPoints =
			participants.length > 0 ? personalPointsSum / participants.length : 0;

		const healthMetricOutcomes: AgoraHealthMetricOutcome[] = topic.healthMetrics.map(
			(metric) => {
				const outcome = results.healthMetrics.find(
					(candidate) => candidate.metricId === metric.metricId
				);

				return {
					metricId: metric.metricId,
					value: Math.max(
						metric.min,
						Math.min(metric.max, Math.round(outcome?.value ?? metric.baseline))
					),
					narrative: outcome?.narrative ?? '',
				};
			}
		);

		const total = Math.round(
			0.45 * maxBridging + 0.25 * Math.min(100, avgPoints) + 0.3 * avgPlausibility
		);
		const classScore: AgoraClassScore = {
			maxConsensus: maxBridging,
			personalPointsSum,
			avgPlausibility,
			total,
			threshold: AGORA_SESSION.SUCCESS_THRESHOLD,
			success: total >= AGORA_SESSION.SUCCESS_THRESHOLD,
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
