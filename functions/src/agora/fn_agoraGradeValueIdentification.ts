import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
	AgoraSession,
	AgoraTopicPackage,
	AgoraValueAnswer,
	AGORA_LIMITS,
	AGORA_POINTS,
	createAgoraParticipantId,
	createAgoraValueAnswerId,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';

interface Request {
	sessionId: string;
	characterId: string;
	answerText: string;
}

interface Result {
	answerId: string;
}

interface Grade {
	score: number;
	matchedValueIds: string[];
	feedback: string;
}

/**
 * Deterministic fixture grading for emulators/e2e/CI (no OPENAI_API_KEY):
 * a value counts as matched when its label or enough of its description
 * words appear in the answer.
 */
function fixtureGrade(
	answerText: string,
	values: Array<{ valueId: string; label: string; description: string }>,
): Grade {
	const normalized = answerText.toLowerCase();
	const matched = values.filter((value) => {
		if (normalized.includes(value.label.toLowerCase())) return true;
		const descWords = value.description
			.toLowerCase()
			.split(/\s+/)
			.filter((word) => word.length > 3);
		const hits = descWords.filter((word) => normalized.includes(word)).length;

		return hits >= 2;
	});
	const score = Math.min(100, Math.round((matched.length / Math.max(1, values.length)) * 100));

	return {
		score,
		matchedValueIds: matched.map((value) => value.valueId),
		feedback:
			matched.length === values.length
				? 'זיהיתם את כל הערכים המרכזיים — כל הכבוד!'
				: matched.length > 0
					? `זיהיתם ${matched.length} מתוך ${values.length} ערכים. חשבו: מה עוד מניע את הדמות?`
					: 'נסו להקשיב שוב לטיעונים — אילו דברים הדמות מזכירה שוב ושוב?',
	};
}

async function aiGrade(
	answerText: string,
	characterName: string,
	values: Array<{ valueId: string; label: string; description: string }>,
	language: string,
): Promise<Grade> {
	const valueList = values
		.map((value) => `- ${value.valueId}: ${value.label} (${value.description})`)
		.join('\n');

	const system = `You grade a student's short answer in a classroom history game. The student watched a character present arguments and must identify the character's underlying VALUES. Respond ONLY with JSON: {"score": 0-100, "matchedValueIds": string[], "feedback": string}. Feedback must be 1-2 encouraging sentences in language "${language}", speaking to the student in second person plural, never revealing unmatched value names outright — hint instead.`;

	const user = `Character: ${characterName}
Answer key (the character's true values):
${valueList}

Student's answer:
"""${answerText}"""

Score generously for meaning, not exact wording. matchedValueIds must only contain ids from the answer key.`;

	const raw = await callLLM({
		model: WORKER_MODEL,
		system,
		user,
		maxTokens: 300,
		temperature: 0.2,
		jsonMode: true,
	});
	const parsed = JSON.parse(extractJson(raw)) as Partial<Grade>;
	const validIds = new Set(values.map((value) => value.valueId));

	return {
		score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
		matchedValueIds: (parsed.matchedValueIds ?? []).filter((id) => validIds.has(id)),
		feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
	};
}

/**
 * Grades a value-identification answer. The client fires this without
 * awaiting and listens to the answer doc — grading lands asynchronously.
 * Idempotent per (session, user, character): re-submission re-grades.
 */
export const agoraGradeValueIdentification = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, characterId, answerText } = request.data ?? {};
		if (!sessionId || !characterId || typeof answerText !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId, characterId, answerText required');
		}
		const trimmed = answerText.trim();
		if (
			trimmed.length < AGORA_LIMITS.MIN_ANSWER_LENGTH ||
			trimmed.length > AGORA_LIMITS.MAX_ANSWER_LENGTH
		) {
			throw new HttpsError('invalid-argument', 'Answer length out of range');
		}

		try {
			const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
			if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found');
			const session = sessionSnap.data() as AgoraSession;

			const topicSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(session.topicPackageId)
				.get();
			if (!topicSnap.exists) throw new HttpsError('not-found', 'Topic package not found');
			const topic = topicSnap.data() as AgoraTopicPackage;

			const character = topic.characters.find((candidate) => candidate.characterId === characterId);
			const answerKey = topic.valueAnswerKey.find((entry) => entry.characterId === characterId);
			if (!character || !answerKey) {
				throw new HttpsError('not-found', 'Character not found in topic package');
			}

			const answerId = createAgoraValueAnswerId(sessionId, uid, characterId);
			const answerRef = db.collection(Collections.agoraValueAnswers).doc(answerId);
			const existingSnap = await answerRef.get();
			const previousScore = existingSnap.exists
				? ((existingSnap.data() as AgoraValueAnswer).aiScore ?? 0)
				: 0;

			const now = Date.now();
			const answer: AgoraValueAnswer = {
				answerId,
				sessionId,
				userId: uid,
				characterId,
				answerText: trimmed,
				createdAt: now,
			};
			await answerRef.set(answer);

			let grade: Grade;
			if (process.env.OPENAI_API_KEY) {
				grade = await aiGrade(trimmed, character.name, answerKey.expectedValues, topic.language);
			} else {
				grade = fixtureGrade(trimmed, answerKey.expectedValues);
			}

			await answerRef.update({
				aiScore: grade.score,
				aiFeedback: grade.feedback,
				matchedValueIds: grade.matchedValueIds,
				gradedAt: Date.now(),
			});

			// Points: value accuracy scaled to AGORA_POINTS.VALUE_ACCURACY_MAX per
			// character. Re-grades replace the previous contribution (delta update).
			const newPoints = Math.round((grade.score / 100) * AGORA_POINTS.VALUE_ACCURACY_MAX);
			const oldPoints = Math.round((previousScore / 100) * AGORA_POINTS.VALUE_ACCURACY_MAX);
			const delta = newPoints - oldPoints;
			if (delta !== 0) {
				const participantRef = db
					.collection(Collections.agoraParticipants)
					.doc(createAgoraParticipantId(sessionId, uid));
				await db.runTransaction(async (transaction) => {
					const participantSnap = await transaction.get(participantRef);
					if (!participantSnap.exists) return;
					const participant = participantSnap.data() as AgoraParticipant;
					const points = { ...participant.points };
					points.valueAccuracy += delta;
					points.total += delta;
					transaction.update(participantRef, { points, lastActive: Date.now() });
				});
			}

			return { answerId };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.gradeValueIdentification',
				userId: uid,
				metadata: { sessionId, characterId },
			});
			throw new HttpsError('internal', 'Failed to grade answer');
		}
	},
);
