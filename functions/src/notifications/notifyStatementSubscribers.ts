/**
 * Shared, app-agnostic notification fan-out for a new reply/child statement.
 *
 * Extracted from `createNotificationsForStatement` so every app (chat, main, MC,
 * sign, flow) shares one filtering + delivery path. For each subscriber of the
 * parent it resolves an effective decision from their per-user
 * `notificationSettings/{uid}` doc (master mute, per-app mute, channel switches,
 * frequency) and per-discussion subscription (`mutedUntil`, `notificationFrequency`):
 *
 *  - INSTANT    → write in-app + send push + send email (per enabled channels), now.
 *  - DAILY/WEEKLY → write in-app now (the in-app center is the passive, non-
 *                   interruptive surface) AND enqueue a held digest-source record
 *                   (status SENT) so the scheduled digest batches push/email.
 *  - NONE / muted → skip.
 *
 *  - Above LARGE_QUESTION_SUBSCRIBER_THRESHOLD, a new answer keeps the in-app
 *    write but INSTANT push/email give way to one daily digest (largeQuestionDigest).
 *
 * Banned, waiting and unsubscribed people are left out before any of this
 * (`loadSubscribers`), on every channel.
 *
 * The actor (the statement's own creator) is never notified about their own post.
 * Behaviour matches the old inline code for users with NO settings doc on the
 * INSTANT path (defaults: not muted, INSTANT, all channels on).
 */
import {
	APP_DEEP_LINKS,
	buildDeepLink,
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationType,
	NotificationTriggerType,
	SourceApp,
	Statement,
	type NotificationQueueItem,
} from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { db } from '../index';
import { getDefaultQuestionType } from '../model/questionTypeDefaults';
import { processFcmNotificationsImproved } from '../fn_notifications';
import {
	pushRecipientFromSubscription,
	resolveFcmSubscribers,
	type PushRecipient,
} from './resolvePushTokens';
import { sendNotificationEmail } from './notificationEmail';
import {
	authorVetoesReplies,
	isNewAnswer,
	isReplyToAnswer,
	vetoesNewAnswers,
} from './answerNotifyGate';
import { commitWritesInChunks, type PendingWrite } from './chunkedWrites';
import { scheduleLargeQuestionDigest, shouldDigestInstead } from './largeQuestionDigest';
import { loadSettings, loadSubscribers, resolveDelivery } from './subscriberDelivery';
import { ancestorIds } from '../utils/statementAncestors';

export interface NotifyOptions {
	/** Distinguishes the event for copy/analytics; defaults to STATEMENT_REPLY. */
	triggerType?: NotificationTriggerType;
	/** Origin app, used for per-app mute, deep links and the in-app `sourceApp` label. */
	sourceApp?: SourceApp;
	/** Deep-link the in-app center / push / email should open. */
	targetPath?: string;
}

/** App-relative deep link to the replied-to discussion, for push/email/digest. */
function resolveTargetPath(opts: NotifyOptions, statement: Statement): string {
	if (opts.targetPath) return opts.targetPath;
	const app = opts.sourceApp ?? statement.sourceApp ?? SourceApp.MAIN;
	if (app === SourceApp.CHAT) return `/q/${statement.parentId}`;
	// Agora statements only make sense inside their live session — the main-app
	// statement route would show a classroom proposal with no game around it.
	if (app === SourceApp.AGORA && statement.agoraSessionId) {
		return buildDeepLink(SourceApp.AGORA, APP_DEEP_LINKS[SourceApp.AGORA].session, {
			sessionId: statement.agoraSessionId,
		});
	}

	return `/statement/${statement.parentId}?focusId=${statement.statementId}`;
}

export async function notifyStatementSubscribers(
	statement: Statement,
	parentStatement: Statement,
	opts: NotifyOptions = {},
): Promise<void> {
	const byUid = await loadSubscribers(db, statement.parentId, ancestorIds(parentStatement));

	// The person's own choices for this question (above everything else except
	// that mute/frequency still apply below): `false` is a veto on every channel.
	const newAnswer = isNewAnswer(statement, parentStatement);
	if (newAnswer) {
		for (const [uid, channels] of byUid) {
			if (vetoesNewAnswers(channels.sub)) byUid.delete(uid);
		}
	} else if (isReplyToAnswer(statement, parentStatement)) {
		const authorUid = parentStatement.creator?.uid;
		if (authorUid && byUid.has(authorUid) && (await authorVetoesReplies(parentStatement))) {
			byUid.delete(authorUid);
		}
	}

	// Counted before the actor leaves, so one question always takes the same path
	// whoever happens to answer.
	const eligibleSubscribers = byUid.size;
	byUid.delete(statement.creator.uid); // never notify the actor about their own post

	if (byUid.size === 0) return;

	const digestInstead = shouldDigestInstead(newAnswer, eligibleSubscribers);
	const settingsMap = await loadSettings(db, [...byUid.keys()]);
	const now = Date.now();
	const questionType = statement.questionSettings?.questionType ?? getDefaultQuestionType();
	const creatorImage = statement.creator.photoURL ?? null; // Firestore rejects undefined
	const targetPath = resolveTargetPath(opts, statement);
	const sourceApp = opts.sourceApp ?? statement.sourceApp;
	const triggerType =
		opts.triggerType ??
		(newAnswer ? NotificationTriggerType.NEW_ANSWER : NotificationTriggerType.STATEMENT_REPLY);
	const emailSubject = `${newAnswer ? 'New answer' : 'New reply'} from ${statement.creator.displayName || 'someone'}`;

	const writes: PendingWrite[] = [];
	const pushRecipients: PushRecipient[] = [];
	const emailSends: Promise<boolean>[] = [];

	for (const [uid, channels] of byUid) {
		const decision = resolveDelivery(settingsMap.get(uid) ?? null, channels, sourceApp, now);
		if (!decision.deliver) continue;

		// In-app is written immediately on every non-muted, non-NONE frequency —
		// it is the passive surface; the badge is the gentle signal.
		if (decision.inApp) {
			const notificationId = `${uid}_${statement.statementId}`; // deterministic → idempotent
			const ref = db.collection(Collections.inAppNotifications).doc(notificationId);
			const newNotification: NotificationType = {
				userId: uid,
				parentId: statement.parentId,
				parentStatement: parentStatement.statement,
				statementType: statement.statementType,
				questionType,
				text: statement.statement,
				creatorId: statement.creator.uid,
				creatorName: statement.creator.displayName,
				creatorImage,
				createdAt: statement.createdAt,
				read: false,
				notificationId,
				statementId: statement.statementId,
				viewedInList: false,
				viewedInContext: false,
				triggerType,
				...(sourceApp ? { sourceApp } : {}),
				targetPath,
			};
			writes.push({ ref, data: newNotification });
		}

		if (decision.frequency === NotificationFrequency.INSTANT) {
			// In a very large question the one daily digest replaces these.
			if (digestInstead) continue;

			// Interruptive channels delivered now.
			if (decision.push) pushRecipients.push(pushRecipientFromSubscription(channels.sub));
			if (decision.email && channels.sub.user?.email) {
				emailSends.push(
					sendNotificationEmail({
						to: channels.sub.user.email,
						recipientName: channels.sub.user.displayName,
						subject: emailSubject,
						bodyText: statement.statement,
						targetPath,
						sourceApp,
					}),
				);
			}
		} else {
			// DAILY / WEEKLY → enqueue a held digest-source record (status SENT so the
			// queue processor ignores it; the scheduled digest recaps it via push/email).
			const heldChannels: NotificationChannel[] = [];
			if (decision.push) heldChannels.push(NotificationChannel.PUSH);
			if (decision.email) heldChannels.push(NotificationChannel.EMAIL);
			if (heldChannels.length > 0) {
				const queueItemId = `digest_${uid}_${statement.statementId}`;
				const item: NotificationQueueItem = {
					queueItemId,
					userId: uid,
					title: emailSubject,
					body: statement.statement,
					channels: heldChannels,
					sourceApp: sourceApp ?? SourceApp.MAIN,
					targetPath,
					deliverAt: null,
					frequency: decision.frequency,
					triggerType,
					statementId: statement.statementId,
					parentId: statement.parentId,
					...(statement.topParentId ? { topParentId: statement.topParentId } : {}),
					status: NotificationQueueStatus.SENT,
					createdAt: now,
				};
				writes.push({
					ref: db.collection(Collections.notificationQueue).doc(queueItemId),
					data: item,
				});
			}
		}
	}

	// A chunk that fails is logged inside and not thrown: rethrowing would invite a
	// retry of the whole function, and pushes are the one thing that would repeat.
	const writeResult = await commitWritesInChunks(db, writes, {
		operation: 'notifications.notifyStatementSubscribers.commit',
		statementId: statement.statementId,
		parentId: statement.parentId,
	});
	if (writeResult.failed > 0) {
		logger.warn('Some subscriber notices were not written', {
			statementId: statement.statementId,
			...writeResult,
		});
	}

	if (digestInstead) {
		await scheduleLargeQuestionDigest(db, {
			statement,
			parentStatement,
			targetPath,
			sourceApp,
			now,
		});
	}

	// Looked up only for people about to get an instant push, so digest and muted
	// subscribers cost no token reads.
	const fcmSubscribers = await resolveFcmSubscribers(db, pushRecipients);
	if (fcmSubscribers.length > 0) {
		const sendResult = await processFcmNotificationsImproved(
			fcmSubscribers,
			statement,
			null,
			newAnswer ? 'answer' : 'reply',
		);
		logger.info('Push notifications processed', {
			statementId: statement.statementId,
			parentId: statement.parentId,
			successful: sendResult.successful,
			failed: sendResult.failed,
			invalidTokens: sendResult.invalidTokens.length,
		});
	}

	if (emailSends.length > 0) {
		const results = await Promise.all(emailSends);
		logger.info('Reply emails processed', {
			statementId: statement.statementId,
			sent: results.filter(Boolean).length,
			attempted: results.length,
		});
	}
}
