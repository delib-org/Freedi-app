import { AGORA_MATERIALS } from '@freedi/shared-types';
import type { AgoraMaterialChat, AgoraMaterialMessage } from '@freedi/shared-types';

/**
 * The per-student, per-lesson question allowance, as pure functions over the
 * chat document. The callable runs them inside a transaction, so two taps
 * racing each other cannot both take the last question.
 *
 * A question is charged the moment it is accepted (before the model runs) and
 * given back if the model fails: the student never pays for an outage, and
 * nobody gets free questions by hammering a slow answer.
 */

export interface ReserveInput {
	sessionId: string;
	userId: string;
	sceneId: string;
	question: string;
	messageId: string;
	now: number;
}

export type ReserveResult =
	| { ok: true; chat: AgoraMaterialChat }
	| { ok: false; reason: 'limit'; used: number };

export function questionsLeft(used: number): number {
	return Math.max(0, AGORA_MATERIALS.QUESTIONS_PER_SESSION - used);
}

export function emptyChat(sessionId: string, userId: string, now: number): AgoraMaterialChat {
	return { sessionId, userId, used: 0, messages: [], lastUpdate: now };
}

export function reserveQuestion(
	existing: AgoraMaterialChat | undefined,
	input: ReserveInput,
): ReserveResult {
	const chat = existing ?? emptyChat(input.sessionId, input.userId, input.now);
	if (chat.used >= AGORA_MATERIALS.QUESTIONS_PER_SESSION) {
		return { ok: false, reason: 'limit', used: chat.used };
	}
	const message: AgoraMaterialMessage = {
		id: input.messageId,
		sceneId: input.sceneId,
		role: 'student',
		text: input.question,
		at: input.now,
	};

	return {
		ok: true,
		chat: {
			...chat,
			used: chat.used + 1,
			messages: [...chat.messages, message],
			lastUpdate: input.now,
		},
	};
}

export function recordAnswer(
	chat: AgoraMaterialChat,
	answer: { id: string; sceneId: string; text: string; notInMaterials: boolean; now: number },
): AgoraMaterialChat {
	const message: AgoraMaterialMessage = {
		id: answer.id,
		sceneId: answer.sceneId,
		role: 'ai',
		text: answer.text,
		at: answer.now,
		...(answer.notInMaterials ? { notInMaterials: true } : {}),
	};

	return { ...chat, messages: [...chat.messages, message], lastUpdate: answer.now };
}

/** Take the question back: the model failed, so it does not count */
export function refundQuestion(
	chat: AgoraMaterialChat,
	messageId: string,
	now: number,
): AgoraMaterialChat {
	const had = chat.messages.some((message) => message.id === messageId);

	return {
		...chat,
		used: had ? Math.max(0, chat.used - 1) : chat.used,
		messages: chat.messages.filter((message) => message.id !== messageId),
		lastUpdate: now,
	};
}

/**
 * The earlier turns of THIS scene that the model sees, oldest first, ending
 * before the question being answered. Capped so the prompt stays small.
 */
export function historyFor(
	chat: AgoraMaterialChat,
	sceneId: string,
	currentMessageId: string,
): AgoraMaterialMessage[] {
	const turns = chat.messages.filter(
		(message) => message.sceneId === sceneId && message.id !== currentMessageId,
	);

	return turns.slice(-AGORA_MATERIALS.HISTORY_PAIRS * 2);
}
