import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraTopicPackage,
	AGORA_LIMITS,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';

interface Request {
	sessionId: string;
	text: string;
}

interface Result {
	improvedText: string;
	/** A short coaching question that challenges the student to sharpen the idea */
	coachNote: string;
}

/**
 * The AI writing companion for proposals: improves phrasing without
 * changing the student's idea, and challenges them with one sharpening
 * question grounded in the historical period.
 */
export const agoraWritingAssistant = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, text } = request.data ?? {};
		const trimmed = (text ?? '').trim();
		if (!sessionId || trimmed.length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH) {
			throw new HttpsError('invalid-argument', 'sessionId and a proposal text are required');
		}

		try {
			const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
			if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found');
			const session = sessionSnap.data() as AgoraSession;
			const topicSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(session.topicPackageId)
				.get();
			const topic = topicSnap.data() as AgoraTopicPackage | undefined;

			if (!process.env.OPENAI_API_KEY) {
				// Deterministic fixture for emulators/e2e/CI
				return {
					improvedText: trimmed,
					coachNote: 'חשבו: איך הפתרון שלכם יתקבל על ידי שני הצדדים? מה כל צד מרוויח ממנו?',
				};
			}

			const system = `You are a supportive writing companion in a classroom history game. Students write solution proposals for a historical dilemma. Improve ONLY clarity and structure — never replace the student's idea with your own. Then challenge them with ONE short sharpening question grounded in the period. Respond ONLY with JSON: {"improvedText": string, "coachNote": string}. Both fields in language "${topic?.language ?? 'en'}"; coachNote max 2 sentences, second person plural.`;

			const user = `Period & challenge: ${topic?.title ?? ''} — "${topic?.challengeQuestion ?? ''}"

Student's proposal draft:
"""${trimmed}"""`;

			const raw = await callLLM({
				model: WORKER_MODEL,
				system,
				user,
				maxTokens: 500,
				temperature: 0.4,
				jsonMode: true,
			});
			const parsed = JSON.parse(extractJson(raw)) as Partial<Result>;

			return {
				improvedText:
					typeof parsed.improvedText === 'string' && parsed.improvedText.trim()
						? parsed.improvedText.trim()
						: trimmed,
				coachNote: typeof parsed.coachNote === 'string' ? parsed.coachNote : '',
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.writingAssistant',
				userId: uid,
				metadata: { sessionId },
			});
			throw new HttpsError('internal', 'Writing assistant failed');
		}
	},
);
