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
	/** Predicted support of the LEFT camp, 0-100 */
	left: number;
	/** Predicted support of the RIGHT camp, 0-100 */
	right: number;
	/** Predicted average evaluation, 0-100 */
	average: number;
}

function clampScore(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.min(100, Math.round(value)))
		: fallback;
}

/** Deterministic fixture: support grows with overlap between the text and each camp's needs */
function fixtureEstimate(text: string, leftNeeds: string[], rightNeeds: string[]): Result {
	const words = new Set(text.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3));
	const score = (needs: string[]): number => {
		let matches = 0;
		for (const need of needs) {
			for (const word of need.split(/[^\p{L}\p{N}]+/u)) {
				if (word.length > 3 && words.has(word)) matches++;
			}
		}

		return Math.max(15, Math.min(85, 35 + matches * 7));
	};
	const left = score(leftNeeds);
	const right = score(rightNeeds);

	return { left, right, average: Math.round((left + right) / 2) };
}

/**
 * Reception forecast: how much would each camp support this draft?
 * Deliberately numbers-only — the AI never writes or advises here, so the
 * thinking about WHY a camp balks stays with the student (the in-character
 * reviews are where opinions live).
 */
export const agoraEstimateReception = onCall(
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
			if (!topic) throw new HttpsError('not-found', 'Topic package not found');

			const byId = new Map(topic.characters.map((character) => [character.characterId, character]));
			const leftCharacter = byId.get(topic.positioningScale.leftCharacterId) ?? topic.characters[0];
			const rightCharacter =
				byId.get(topic.positioningScale.rightCharacterId) ?? topic.characters[1];

			if (!process.env.OPENAI_API_KEY) {
				// Deterministic fixture for emulators/e2e/CI
				return fixtureEstimate(trimmed, leftCharacter?.needs ?? [], rightCharacter?.needs ?? []);
			}

			const system = `You are the reception forecaster in a classroom history game about "${topic.title}" — "${topic.challengeQuestion}". Two camps:
LEFT — "${topic.positioningScale.leftLabel}", represented by ${leftCharacter?.name ?? ''}; needs: ${(leftCharacter?.needs ?? []).join('; ')}
RIGHT — "${topic.positioningScale.rightLabel}", represented by ${rightCharacter?.name ?? ''}; needs: ${(rightCharacter?.needs ?? []).join('; ')}
Estimate how each camp would receive the student's proposal on a 0-100 support scale (0 = fierce opposition, 50 = torn, 100 = enthusiastic). Judge ONLY from the camps' needs and interests. Respond ONLY with JSON: {"left": number, "right": number}. No explanations.`;

			const raw = await callLLM({
				model: WORKER_MODEL,
				system,
				user: `Student's proposal:\n"""${trimmed}"""`,
				maxTokens: 60,
				temperature: 0.2,
				jsonMode: true,
			});
			const parsed = JSON.parse(extractJson(raw)) as Partial<Result>;
			const left = clampScore(parsed.left, 50);
			const right = clampScore(parsed.right, 50);

			return { left, right, average: Math.round((left + right) / 2) };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.estimateReception',
				userId: uid,
				metadata: { sessionId },
			});
			throw new HttpsError('internal', 'Reception estimate failed');
		}
	},
);
