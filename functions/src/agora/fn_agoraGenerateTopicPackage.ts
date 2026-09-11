import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	AgoraTopicStatus,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, TAXONOMY_MODEL } from '../config/openai-chat';
import { buildTopicPrompt } from './topicPrompt';

interface Request {
	statement?: string;
	description?: string;
	/** Older clients submit topic only. */
	topic?: string;
	language: string;
}

interface Result {
	topicPackageId: string;
}

/**
 * Teacher provides a question and purpose; AI drafts a simple scenario for review.
 * Never disguise an unrelated demo package as a successful generation.
 */
export const agoraGenerateTopicPackage = onCall(
	{ region: functionConfig.region, timeoutSeconds: 300 },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}

		const { statement, description, topic, language } = request.data ?? {};
		const question = statement ?? topic;
		if (
			typeof question !== 'string' ||
			question.trim().length < 2 ||
			question.trim().length > 200
		) {
			throw new HttpsError('invalid-argument', 'statement must contain 2–200 characters');
		}
		if (
			(statement !== undefined && typeof description !== 'string') ||
			(description !== undefined &&
				(typeof description !== 'string' || description.trim().length > 2000)) ||
			(statement !== undefined && !description?.trim())
		) {
			throw new HttpsError('invalid-argument', 'description must contain 1–2000 characters');
		}
		const brief = { statement: question.trim(), description: description?.trim() ?? '' };
		const lang = typeof language === 'string' && language ? language : 'en';
		if (!process.env.OPENAI_API_KEY) {
			throw new HttpsError('failed-precondition', 'AI generation is not configured');
		}

		try {
			const topicPackageId = getRandomUID();
			const now = Date.now();
			const { system, user } = buildTopicPrompt(brief.statement, brief.description, lang);
			const raw = await callLLM({
				model: TAXONOMY_MODEL,
				system,
				user,
				maxTokens: 6000,
				temperature: 0.3,
				jsonMode: true,
			});
			const draft = JSON.parse(extractJson(raw)) as Record<string, unknown>;

			const characters = (draft.characters ?? []) as Array<{
				characterId: string;
				values?: Array<{ valueId: string; label: string; description: string }>;
			}>;

			const candidate = {
				...draft,
				topicPackageId,
				creatorId: uid,
				kind: 'scenario',
				topic: brief.statement,
				authoringBrief: brief,
				// The model cannot silently replace the teacher's question.
				title: brief.statement,
				challengeQuestion: brief.statement,
				language: lang,
				status: AgoraTopicStatus.draft,
				// The answer key mirrors each character's values
				valueAnswerKey: characters.map((character) => ({
					characterId: character.characterId,
					expectedValues: character.values ?? [],
				})),
				scenes: ((draft.scenes ?? []) as Array<Record<string, unknown>>).map((scene) => ({
					imageUrls: [],
					dialogue: [],
					...scene,
				})),
				createdAt: now,
				lastUpdate: now,
			};

			// Validate against the shared schema so a malformed AI response
			// fails loudly here instead of breaking clients later.
			const validated: AgoraTopicPackage = parse(AgoraTopicPackageSchema, candidate);

			await db.collection(Collections.agoraTopicPackages).doc(topicPackageId).set(validated);

			return { topicPackageId };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.generateTopicPackage',
				userId: uid,
				metadata: { topic, language: lang },
			});
			throw new HttpsError('internal', 'Failed to generate topic package');
		}
	},
);
