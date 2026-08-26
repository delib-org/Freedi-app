/**
 * Facilitator nudge: a question admin sends a short message to the
 * question's subscribers (optionally only those who have not yet suggested
 * or evaluated) via in-app notifications and/or email. Rate-limited to one
 * nudge per question per hour (`questionProgress.lastNudgeAt`).
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	NotificationTriggerType,
	NotificationType,
	QuestionParticipation,
	QuestionProgress,
	Role,
	SourceApp,
	Statement,
	StatementSubscription,
	functionConfig,
	getQuestionParticipationId,
} from '@freedi/shared-types';
import { db } from './db';
import { assertStatementAdmin } from './progress/assertStatementAdmin';
import { getEmailTransporter } from './utils/emailTransporter';
import { createStatementUpdateEmail } from './email-templates';
import { logError } from './utils/errorHandling';

export type NudgeAudience = 'all' | 'notSuggested' | 'notEvaluated';
export type NudgeChannel = 'inApp' | 'email';

export interface NudgeRequest {
	statementId: string;
	message: string;
	audience: NudgeAudience;
	channels: NudgeChannel[];
}

export interface NudgeResult {
	sent: number;
	inApp: number;
	email: number;
}

export const NUDGE_MESSAGE_MAX = 280;
export const NUDGE_COOLDOWN_MS = 60 * 60 * 1000;
const PAGE_SIZE = 500;
const GET_ALL_CHUNK = 100;
const WRITE_BATCH_SIZE = 400;
const EMAIL_CAP = 500;
const AUDIENCES: readonly NudgeAudience[] = ['all', 'notSuggested', 'notEvaluated'];
const CHANNELS: readonly NudgeChannel[] = ['inApp', 'email'];
const EXCLUDED_ROLES: readonly Role[] = [Role.banned, Role.unsubscribed, Role.waiting];

function validateRequest(data: Partial<NudgeRequest> | undefined): NudgeRequest {
	const statementId = data?.statementId;
	if (!statementId || typeof statementId !== 'string') {
		throw new HttpsError('invalid-argument', 'statementId is required');
	}
	const message = typeof data?.message === 'string' ? data.message.trim() : '';
	if (message.length < 1 || message.length > NUDGE_MESSAGE_MAX) {
		throw new HttpsError(
			'invalid-argument',
			`message must be between 1 and ${NUDGE_MESSAGE_MAX} characters`,
		);
	}
	const audience = data?.audience ?? 'all';
	if (!AUDIENCES.includes(audience)) {
		throw new HttpsError('invalid-argument', 'audience must be all | notSuggested | notEvaluated');
	}
	const channels = Array.isArray(data?.channels) ? data.channels : [];
	if (channels.length === 0 || channels.some((c) => !CHANNELS.includes(c))) {
		throw new HttpsError('invalid-argument', 'channels must contain inApp and/or email');
	}

	return { statementId, message, audience, channels };
}

async function assertNotRateLimited(statementId: string, now: number): Promise<void> {
	const snap = await db.collection(Collections.questionProgress).doc(statementId).get();
	const lastNudgeAt = (snap.data() as Partial<QuestionProgress> | undefined)?.lastNudgeAt;
	if (lastNudgeAt && now - lastNudgeAt < NUDGE_COOLDOWN_MS) {
		const minutesLeft = Math.ceil((NUDGE_COOLDOWN_MS - (now - lastNudgeAt)) / 60000);
		throw new HttpsError(
			'resource-exhausted',
			`A nudge was sent recently. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
		);
	}
}

async function loadSubscribers(
	statementId: string,
	callerUid: string,
): Promise<StatementSubscription[]> {
	const byUser = new Map<string, StatementSubscription>();
	let cursor: QueryDocumentSnapshot | null = null;
	for (;;) {
		let q = db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statementId)
			.orderBy(FieldPath.documentId())
			.limit(PAGE_SIZE);
		if (cursor) q = q.startAfter(cursor);
		const page = await q.get();
		if (page.empty) break;
		page.docs.forEach((doc) => {
			const sub = doc.data() as StatementSubscription;
			const uid = sub.user?.uid ?? sub.userId;
			if (!uid || uid === callerUid) return;
			if (EXCLUDED_ROLES.includes(sub.role)) return;
			byUser.set(uid, sub);
		});
		if (page.size < PAGE_SIZE) break;
		cursor = page.docs[page.docs.length - 1];
	}

	return [...byUser.values()];
}

async function filterByAudience(
	statementId: string,
	subscribers: StatementSubscription[],
	audience: NudgeAudience,
): Promise<StatementSubscription[]> {
	if (audience === 'all') return subscribers;
	const flag: keyof QuestionParticipation = audience === 'notSuggested' ? 'suggested' : 'evaluated';
	const kept: StatementSubscription[] = [];
	for (let i = 0; i < subscribers.length; i += GET_ALL_CHUNK) {
		const chunk = subscribers.slice(i, i + GET_ALL_CHUNK);
		const refs = chunk.map((sub) =>
			db
				.collection(Collections.questionParticipation)
				.doc(getQuestionParticipationId(statementId, sub.user?.uid ?? sub.userId)),
		);
		const snaps = await db.getAll(...refs);
		snaps.forEach((snap, idx) => {
			const marker = snap.exists ? (snap.data() as Partial<QuestionParticipation>) : undefined;
			if (!marker?.[flag]) kept.push(chunk[idx]);
		});
	}

	return kept;
}

async function writeInAppNotifications(
	statement: Statement,
	subscribers: StatementSubscription[],
	message: string,
	callerUid: string,
	callerName: string,
	now: number,
): Promise<number> {
	let batch = db.batch();
	let pending = 0;
	let written = 0;
	for (const sub of subscribers) {
		const userId = sub.user?.uid ?? sub.userId;
		const notificationId = `${userId}_nudge_${statement.statementId}_${now}`;
		const notification: NotificationType = {
			notificationId,
			userId,
			parentId: statement.parentId,
			statementId: statement.statementId,
			statementType: statement.statementType,
			parentStatement: statement.statement,
			text: message,
			title: statement.statement,
			creatorId: callerUid,
			creatorName: callerName,
			createdAt: now,
			read: false,
			viewedInList: false,
			viewedInContext: false,
			triggerType: NotificationTriggerType.FACILITATOR_NUDGE,
			sourceApp: statement.sourceApp ?? SourceApp.MAIN,
			targetPath: `/statement/${statement.statementId}`,
		};
		batch.set(db.collection(Collections.inAppNotifications).doc(notificationId), notification);
		pending++;
		written++;
		if (pending >= WRITE_BATCH_SIZE) {
			await batch.commit();
			batch = db.batch();
			pending = 0;
		}
	}
	if (pending > 0) await batch.commit();

	return written;
}

async function sendEmails(
	statement: Statement,
	subscribers: StatementSubscription[],
	message: string,
): Promise<number> {
	const recipients = subscribers
		.filter((sub) => !!sub.user?.email && sub.getEmailNotification !== false)
		.slice(0, EMAIL_CAP);
	if (recipients.length === 0) return 0;
	const transporter = await getEmailTransporter();
	if (!transporter) return 0;

	let sent = 0;
	for (const sub of recipients) {
		try {
			await transporter.sendMail({
				from: process.env.EMAIL_USER,
				to: sub.user.email as string,
				subject: `Update on "${statement.statement}"`,
				html: createStatementUpdateEmail({
					statementId: statement.statementId,
					statementTitle: statement.statement,
					recipientName: sub.user.displayName,
					customMessage: message,
				}),
				text: message,
			});
			sent++;
		} catch (error) {
			logError(error, {
				operation: 'nudge.sendEmail',
				userId: sub.user.uid,
				statementId: statement.statementId,
			});
		}
	}

	return sent;
}

export interface SendQuestionNudgeInput {
	statement: Statement;
	message: string;
	audience: NudgeAudience;
	channels: NudgeChannel[];
	/** Uid recorded as the notification creator (excluded from recipients). */
	callerUid: string;
	callerName: string;
	now?: number;
	/**
	 * Enforce the 1h/question cooldown (manual nudges). Scheduled nudges pass
	 * `false`: they were placed deliberately, but still stamp `lastNudgeAt`
	 * so a manual nudge right after is throttled.
	 */
	enforceCooldown?: boolean;
}

/**
 * Sends a nudge to a question's subscribers. Authorization and request
 * validation are the caller's job (`nudgeQuestionSubscribersForAdmin`, the
 * scheduled-action executor).
 */
export async function sendQuestionNudge(input: SendQuestionNudgeInput): Promise<NudgeResult> {
	const { statement, message, audience, channels, callerUid, callerName } = input;
	const statementId = statement.statementId;
	const now = input.now ?? Date.now();
	if (input.enforceCooldown !== false) {
		await assertNotRateLimited(statementId, now);
	}

	const subscribers = await loadSubscribers(statementId, callerUid);
	const targets = await filterByAudience(statementId, subscribers, audience);

	let inApp = 0;
	let email = 0;
	if (channels.includes('inApp')) {
		inApp = await writeInAppNotifications(statement, targets, message, callerUid, callerName, now);
	}
	if (channels.includes('email')) {
		email = await sendEmails(statement, targets, message);
	}

	await db
		.collection(Collections.questionProgress)
		.doc(statementId)
		.set({ statementId, lastNudgeAt: now, lastUpdate: now }, { merge: true });

	logger.info('[nudge] sent facilitator nudge', {
		statementId,
		audience,
		channels,
		targets: targets.length,
		inApp,
		email,
		scheduled: input.enforceCooldown === false,
	});

	return { sent: targets.length, inApp, email };
}

export async function nudgeQuestionSubscribersForAdmin(
	callerUid: string,
	callerName: string,
	rawData: Partial<NudgeRequest> | undefined,
): Promise<NudgeResult> {
	const { statementId, message, audience, channels } = validateRequest(rawData);
	const { statement } = await assertStatementAdmin(callerUid, statementId, 'nudge.send');

	return sendQuestionNudge({
		statement,
		message,
		audience,
		channels,
		callerUid,
		callerName,
		enforceCooldown: true,
	});
}

export const fn_nudgeQuestionSubscribers = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<NudgeRequest>): Promise<NudgeResult> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const tokenName = (request.auth?.token as { name?: string } | undefined)?.name ?? '';
		const callerName = tokenName.trim() || 'Facilitator';

		return nudgeQuestionSubscribersForAdmin(uid, callerName, request.data);
	},
);
