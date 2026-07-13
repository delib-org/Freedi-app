import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraCharacter,
	AgoraCharacterReview,
	AgoraSceneKind,
	AgoraSession,
	AgoraStage,
	AgoraTopicPackage,
	AGORA_AI_REVIEW,
	Evaluation,
	Statement,
	agoraScoreToEvaluation,
	createAgoraAiRaterUid,
	createAgoraCharacterReviewId,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';

interface Request {
	sessionId: string;
	characterId: string;
	statementId: string;
}

interface Result {
	verdictText: string;
	acceptanceScore: number;
	advice: string[];
	asksLeft: number;
}

interface Review {
	verdictText: string;
	acceptanceScore: number;
	advice: string[];
}

/**
 * Deterministic fixture review for emulators/e2e/CI (no OPENAI_API_KEY):
 * the score comes from keyword overlap between the proposal and the
 * character's needs and value labels/descriptions, plus a length component.
 */
function fixtureReview(proposalText: string, character: AgoraCharacter): Review {
	const normalized = proposalText.toLowerCase();
	const needles = [
		...(character.needs ?? []),
		...character.values.map((value) => value.label),
		...character.values.map((value) => value.description),
	]
		.flatMap((entry) => entry.toLowerCase().split(/\s+/))
		.filter((word) => word.length > 3);
	const hits = new Set(needles.filter((word) => normalized.includes(word))).size;
	const overlapScore = Math.min(70, hits * 10);
	const lengthScore = Math.min(30, Math.round(proposalText.trim().length / 20));
	const acceptanceScore = Math.min(100, overlapScore + lengthScore);

	const firstNeed = character.needs?.[0] ?? character.values[0]?.label ?? '';

	return {
		verdictText:
			acceptanceScore >= 60
				? `אני, ${character.name}, מוצא בהצעתכם דברים שאוכל לחיות איתם. אם תראו לי שגם ${firstNeed} מובטח — אתמוך בה.`
				: `אני, ${character.name}, עדיין חושש. ההצעה אינה עונה על מה שחשוב לי באמת — ${firstNeed}. שכנעו אותי שלא אצא מפסיד.`,
		acceptanceScore,
		advice: [
			`הראו במפורש כיצד ההצעה עונה על הצורך: ${firstNeed}`,
			'הוסיפו צעד קונקרטי אחד שאפשר לבצע כבר מחר',
		],
	};
}

async function aiReview(
	proposalText: string,
	character: AgoraCharacter,
	topic: AgoraTopicPackage,
): Promise<Review> {
	const periodContext =
		topic.scenes.find((scene) => scene.kind === AgoraSceneKind.periodExplainer)?.text ??
		topic.framingText;
	const valueList = character.values
		.map((value) => `- ${value.label}: ${value.description}`)
		.join('\n');

	const system = `You are ${character.name}, ${character.role}, in "${topic.title}". Stay strictly in character and in period. A student in a classroom deliberation game shows you their proposal for the challenge: "${topic.challengeQuestion}".
Your spoken arguments: ${character.arguments.join(' | ')}
Your true needs: ${(character.needs ?? []).join(' | ')}
Your values:
${valueList}
Judge the proposal ONLY as this person would — would you accept it, what would it take. Respond ONLY with JSON: {"verdictText": string, "acceptanceScore": 0-100, "advice": string[]}.
verdictText: 2-4 sentences in language "${topic.language}", first person, in character — what works for me, what would make me accept it. Honest as the character, but warm toward the student.
advice: 2-3 concrete, actionable improvements that would address my needs. acceptanceScore: how acceptable the proposal is to me as written.`;

	const user = `Period context:
${periodContext}

The student's proposal:
"""${proposalText}"""`;

	const raw = await callLLM({
		model: WORKER_MODEL,
		system,
		user,
		maxTokens: 500,
		temperature: 0.4,
		jsonMode: true,
	});
	const parsed = JSON.parse(extractJson(raw)) as Partial<Review>;

	return {
		verdictText: typeof parsed.verdictText === 'string' ? parsed.verdictText : '',
		acceptanceScore: Math.max(0, Math.min(100, Math.round(Number(parsed.acceptanceScore) || 0))),
		advice: (parsed.advice ?? []).filter((entry): entry is string => typeof entry === 'string'),
	};
}

/**
 * In-character proposal review — "show your proposal to the Count".
 * The character replies in character (verdict + advice) AND rates the
 * proposal through the real evaluation pipeline as 3 synthetic raters
 * seeded at session creation, so the character's approval moves camp
 * support and the bridging score exactly like 3 classmates would.
 * Deterministic evaluation ids make re-asks updates, never double counts.
 */
export const agoraCharacterReview = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, characterId, statementId } = request.data ?? {};
		if (!sessionId || !characterId || !statementId) {
			throw new HttpsError('invalid-argument', 'sessionId, characterId, statementId required');
		}

		try {
			const [sessionSnap, proposalSnap] = await Promise.all([
				db.collection(Collections.agoraSessions).doc(sessionId).get(),
				db.collection(Collections.statements).doc(statementId).get(),
			]);
			if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found');
			const session = sessionSnap.data() as AgoraSession;
			if (session.stage !== AgoraStage.deliberation) {
				throw new HttpsError(
					'failed-precondition',
					'Character reviews only run in the deliberation stage',
				);
			}
			if (!proposalSnap.exists) throw new HttpsError('not-found', 'Proposal not found');
			// agoraSessionId is stamped onto proposal statements at creation but is
			// not part of the shared Statement schema
			const proposal = proposalSnap.data() as Statement & { agoraSessionId?: string };
			if (proposal.agoraSessionId !== sessionId) {
				throw new HttpsError('permission-denied', 'Proposal is not part of this session');
			}
			if (proposal.creatorId !== uid) {
				throw new HttpsError('permission-denied', 'You can only show your own proposal');
			}

			const topicSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(session.topicPackageId)
				.get();
			if (!topicSnap.exists) throw new HttpsError('not-found', 'Topic package not found');
			const topic = topicSnap.data() as AgoraTopicPackage;
			const character = topic.characters.find((candidate) => candidate.characterId === characterId);
			if (!character) {
				throw new HttpsError('not-found', 'Character not found in topic package');
			}

			// Reserve an ask slot BEFORE the slow LLM call — a transaction on the
			// review doc makes double-clicks race-safe.
			const reviewId = createAgoraCharacterReviewId(statementId, characterId);
			const reviewRef = db.collection(Collections.agoraCharacterReviews).doc(reviewId);
			const roundKey = String(session.roundNumber);
			const asksUsed = await db.runTransaction(async (transaction) => {
				const reviewSnap = await transaction.get(reviewRef);
				const existing = reviewSnap.exists ? (reviewSnap.data() as AgoraCharacterReview) : null;
				const used = existing?.asksByRound?.[roundKey] ?? 0;
				if (used >= AGORA_AI_REVIEW.MAX_ASKS_PER_CHARACTER_PER_ROUND) {
					throw new HttpsError('resource-exhausted', 'No character reviews left this round');
				}
				transaction.set(
					reviewRef,
					{
						reviewId,
						sessionId,
						statementId,
						characterId,
						asksByRound: { ...existing?.asksByRound, [roundKey]: used + 1 },
						createdAt: existing?.createdAt ?? Date.now(),
						lastUpdate: Date.now(),
					},
					{ merge: true },
				);

				return used + 1;
			});

			const review = process.env.OPENAI_API_KEY
				? await aiReview(proposal.statement, character, topic)
				: fixtureReview(proposal.statement, character);

			const now = Date.now();
			const batch = db.batch();
			batch.set(
				reviewRef,
				{
					verdictText: review.verdictText,
					acceptanceScore: review.acceptanceScore,
					advice: review.advice,
					roundNumber: session.roundNumber,
					lastUpdate: now,
				},
				{ merge: true },
			);

			// The character rates through the main evaluation system as 3 raters.
			const evaluationValue = agoraScoreToEvaluation(review.acceptanceScore);
			for (let index = 1; index <= AGORA_AI_REVIEW.RATERS_PER_CHARACTER; index++) {
				const aiUid = createAgoraAiRaterUid(characterId, index);
				const evaluationId = `${aiUid}--${statementId}`;
				const evaluation: Evaluation = {
					evaluationId,
					parentId: session.challengeQuestionId,
					statementId,
					evaluatorId: aiUid,
					evaluation: evaluationValue,
					evaluator: {
						uid: aiUid,
						displayName: character.name,
						isAnonymous: true,
					},
					agoraSessionId: sessionId,
					updatedAt: now,
				};
				batch.set(db.collection(Collections.evaluations).doc(evaluationId), evaluation);
			}
			await batch.commit();

			return {
				verdictText: review.verdictText,
				acceptanceScore: review.acceptanceScore,
				advice: review.advice,
				asksLeft: AGORA_AI_REVIEW.MAX_ASKS_PER_CHARACTER_PER_ROUND - asksUsed,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.characterReview',
				userId: uid,
				statementId,
				metadata: { sessionId, characterId },
			});
			throw new HttpsError('internal', 'Failed to review proposal');
		}
	},
);
