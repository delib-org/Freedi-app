import { randomUUID } from 'crypto';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import type { DocumentReference } from 'firebase-admin/firestore';
import {
	AGORA_MATERIALS,
	Collections,
	createAgoraMaterialChatId,
	createAgoraParticipantId,
	createAgoraSceneMaterialsId,
	functionConfig,
	isAgoraAiUid,
} from '@freedi/shared-types';
import type {
	AgoraMaterialChat,
	AgoraParticipant,
	AgoraSceneMaterials,
	AgoraSession,
	AgoraTopicPackage,
	AskMaterialsRequest,
	AskMaterialsResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLMChat, WORKER_MODEL } from '../config/openai-chat';
import { checkLanguageFor } from './fn_agoraCheckLanguage';
import { buildChatMessages, parseAnswer, type ParsedAnswer } from './materialsPrompt';
import { historyFor, recordAnswer, refundQuestion, reserveQuestion } from './materialsQuota';

const LIMIT = AGORA_MATERIALS.QUESTIONS_PER_SESSION;

/** The model, injectable so the callable's flow is testable without a key */
export type AnswerModel = (messages: ReturnType<typeof buildChatMessages>) => Promise<string>;

export const askModel: AnswerModel = (messages) =>
	callLLMChat({
		model: WORKER_MODEL,
		messages,
		maxTokens: AGORA_MATERIALS.MAX_ANSWER_TOKENS,
		reasoningEffort: 'low',
		jsonMode: true,
	});

function chatRef(sessionId: string, uid: string): DocumentReference {
	return db
		.collection(Collections.agoraMaterialChats)
		.doc(createAgoraMaterialChatId(sessionId, uid));
}

export interface AskInput {
	uid: string;
	sessionId: string;
	sceneId: string;
	question: string;
	language: string;
}

/**
 * One student question, end to end: gate → reserve the question → ask the model
 * → store the answer. Exported with the model injected for tests.
 */
export async function askMaterialsFor(
	input: AskInput,
	model: AnswerModel = askModel,
	now: () => number = Date.now,
): Promise<AskMaterialsResponse> {
	const { uid, sessionId, sceneId, language } = input;
	const question = input.question.trim().slice(0, AGORA_MATERIALS.MAX_QUESTION_CHARS);
	const ref = chatRef(sessionId, uid);

	const [sessionSnap, participantSnap, chatSnap] = await Promise.all([
		db.collection(Collections.agoraSessions).doc(sessionId).get(),
		db
			.collection(Collections.agoraParticipants)
			.doc(createAgoraParticipantId(sessionId, uid))
			.get(),
		ref.get(),
	]);
	const session = sessionSnap.data() as AgoraSession | undefined;
	if (!session) throw new HttpsError('not-found', 'Session not found');
	const participant = participantSnap.data() as AgoraParticipant | undefined;
	if (!participant || participant.isAI || isAgoraAiUid(uid)) {
		throw new HttpsError('permission-denied', 'not-a-participant');
	}
	const used = (chatSnap.data() as AgoraMaterialChat | undefined)?.used ?? 0;
	if (!question) return { ok: false, reason: 'empty', used, limit: LIMIT };
	if (used >= LIMIT) return { ok: false, reason: 'limit', used, limit: LIMIT };

	const [packageSnap, materialsSnap] = await Promise.all([
		db.collection(Collections.agoraTopicPackages).doc(session.topicPackageId).get(),
		db
			.collection(Collections.agoraSceneMaterials)
			.doc(createAgoraSceneMaterialsId(session.topicPackageId, sceneId))
			.get(),
	]);
	const topic = packageSnap.data() as AgoraTopicPackage | undefined;
	const scene = topic?.scenes.find((candidate) => candidate.sceneId === sceneId);
	const materials = materialsSnap.data() as AgoraSceneMaterials | undefined;
	if (!scene || !materials || materials.items.length === 0) {
		return { ok: false, reason: 'no_materials', used, limit: LIMIT };
	}

	// The same gate every student write passes; a refusal is charged and filed there
	// and costs no question.
	const verdict = await checkLanguageFor({ uid, sessionId, text: question });
	if (!verdict.ok) {
		if (verdict.reason === 'banned_word') {
			return { ok: false, reason: 'banned_word', used, limit: LIMIT, word: verdict.word };
		}

		return {
			ok: false,
			reason: 'language',
			used,
			limit: LIMIT,
			strikes: verdict.strikes,
			deducted: verdict.deducted,
			pointsTotal: verdict.pointsTotal,
		};
	}

	const messageId = randomUUID();
	const stamp = now();
	const reserved = await db.runTransaction(async (transaction) => {
		const fresh = (await transaction.get(ref)).data() as AgoraMaterialChat | undefined;
		const result = reserveQuestion(fresh, {
			sessionId,
			userId: uid,
			sceneId,
			question,
			messageId,
			now: stamp,
		});
		if (result.ok) transaction.set(ref, result.chat);

		return result;
	});
	if (!reserved.ok) return { ok: false, reason: 'limit', used: reserved.used, limit: LIMIT };

	let parsed: ParsedAnswer | null = null;
	try {
		const messages = buildChatMessages(
			{ sceneTitle: scene.title, items: materials.items, language },
			historyFor(reserved.chat, sceneId, messageId),
			question,
		);
		parsed = parseAnswer(await model(messages));
	} catch (error) {
		logError(error, {
			operation: 'agora.askMaterials.model',
			userId: uid,
			metadata: { sessionId, sceneId },
		});
	}

	if (!parsed) {
		const refunded = await db.runTransaction(async (transaction) => {
			const fresh = (await transaction.get(ref)).data() as AgoraMaterialChat | undefined;
			const next = fresh ? refundQuestion(fresh, messageId, now()) : undefined;
			if (next) transaction.set(ref, next);

			return next?.used ?? 0;
		});

		return { ok: false, reason: 'unavailable', used: refunded, limit: LIMIT };
	}

	const answered = parsed;
	const finalUsed = await db.runTransaction(async (transaction) => {
		const fresh = (await transaction.get(ref)).data() as AgoraMaterialChat | undefined;
		if (!fresh) return reserved.chat.used;
		transaction.set(
			ref,
			recordAnswer(fresh, {
				id: randomUUID(),
				sceneId,
				text: answered.answer,
				notInMaterials: !answered.found,
				now: now(),
			}),
		);

		return fresh.used;
	});

	return {
		ok: true,
		answer: answered.answer,
		notInMaterials: !answered.found,
		used: finalUsed,
		limit: LIMIT,
	};
}

/**
 * A student asks the AI about a library scene's materials. The AI answers only
 * from those materials; the conversation is the student's alone (rules: owner
 * read, no client write); 15 questions per student per lesson, counted here.
 */
export const agoraAskMaterials = onCall(
	{ region: functionConfig.region, timeoutSeconds: 90, memory: '512MiB' },
	async (request: CallableRequest<AskMaterialsRequest>): Promise<AskMaterialsResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { sessionId, sceneId, question, language } = request.data ?? ({} as AskMaterialsRequest);
		if (typeof sessionId !== 'string' || !sessionId || typeof sceneId !== 'string' || !sceneId) {
			throw new HttpsError('invalid-argument', 'sessionId and sceneId are required');
		}
		if (typeof question !== 'string')
			throw new HttpsError('invalid-argument', 'question is required');

		try {
			return await askMaterialsFor({
				uid,
				sessionId,
				sceneId,
				question,
				language: typeof language === 'string' ? language : 'en',
			});
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			// Never the question: it is a child's words, and this is Cloud Logging.
			logError(error, {
				operation: 'agora.askMaterials',
				userId: uid,
				metadata: { sessionId, sceneId },
			});
			throw new HttpsError('internal', 'Ask failed');
		}
	},
);
