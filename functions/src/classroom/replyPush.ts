import type { Firestore } from 'firebase-admin/firestore';
import type { Message } from 'firebase-admin/messaging';
import { Collections } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { REPLY_PUSH_TTL_SECONDS } from './replyLogic';
import { replyPushBody, replyPushLanguageOf } from './replyPushText';

/**
 * Delivery of the "someone replied" push (IA 22.7). A join-class device that
 * said yes keeps one `pushNotifications/{token}` doc (`userId`, `app`,
 * `language`), the same collection the main app's invalid-token cleanup reads,
 * and is never added to a subscription's `tokens[]` (that would let the main
 * app's fan-out buzz the phone for every statement of the lesson).
 *
 * The message is data-only: the join-class push worker shows it, and skips it
 * when a join-class window is already visible. `tag` = the proposal, so a newer
 * push replaces the older one on the lock screen.
 */

/** The `app` value on a join-class device doc. */
export const JOIN_CLASS_PUSH_APP = 'join-class';

export interface ReplyDevice {
	token: string;
	language: string | undefined;
}

export interface ReplyPushContent {
	mainId: string;
	proposalId: string;
	lessonTitle: string;
	/** New replies the author has not opened (at least 1). */
	count: number;
}

/** Sends the messages; answers the tokens FCM called invalid. Injectable for tests. */
export type ReplyPushSender = (messages: Message[]) => Promise<string[]>;

const INVALID_TOKEN_CODES: ReadonlySet<string> = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
	'messaging/invalid-argument',
]);

async function sendWithFcm(messages: Message[]): Promise<string[]> {
	const { getMessaging } = await import('firebase-admin/messaging');
	const response = await getMessaging().sendEach(messages);
	const invalid: string[] = [];
	response.responses.forEach((result, index) => {
		const code = result.error?.code;
		const message = messages[index];
		if (!result.success && code && INVALID_TOKEN_CODES.has(code) && 'token' in message) {
			invalid.push(message.token);
		}
	});

	return invalid;
}

/** The author's join-class devices (tokens of other apps are left alone). */
export async function loadReplyDevices(db: Firestore, authorUid: string): Promise<ReplyDevice[]> {
	const snap = await db
		.collection(Collections.pushNotifications)
		.where('userId', '==', authorUid)
		.get();

	return snap.docs
		.map((d) => d.data() as { token?: string; app?: string; language?: string })
		.filter((d) => d.app === JOIN_CLASS_PUSH_APP && typeof d.token === 'string' && d.token)
		.map((d) => ({ token: d.token as string, language: d.language }));
}

/** One data-only web push per device, in the device's language. */
export function buildReplyMessages(
	devices: readonly ReplyDevice[],
	content: ReplyPushContent,
): Message[] {
	const url = `/m/${encodeURIComponent(content.mainId)}?replies=${encodeURIComponent(content.proposalId)}`;

	return devices.map((device) => ({
		token: device.token,
		data: {
			title: content.lessonTitle,
			body: replyPushBody(replyPushLanguageOf(device.language), content.count),
			url,
			tag: `reply-${content.proposalId}`,
		},
		webpush: {
			headers: { Urgency: 'high', TTL: String(REPLY_PUSH_TTL_SECONDS) },
		},
	}));
}

/**
 * Send, then delete the device docs FCM rejected. Never throws: a push is a
 * courtesy, and the reply is already saved and shown in the app.
 */
export async function sendReplyPush(
	db: Firestore,
	devices: readonly ReplyDevice[],
	content: ReplyPushContent,
	send: ReplyPushSender = sendWithFcm,
): Promise<void> {
	if (devices.length === 0) return;
	try {
		const invalid = await send(buildReplyMessages(devices, content));
		if (invalid.length === 0) return;
		const batch = db.batch();
		invalid.forEach((token) =>
			batch.delete(db.collection(Collections.pushNotifications).doc(token)),
		);
		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'classroom.sendReplyPush',
			statementId: content.proposalId,
			metadata: { mainId: content.mainId, devices: devices.length },
		});
	}
}
