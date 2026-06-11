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
 * The actor (the statement's own creator) is never notified about their own post.
 * Behaviour matches the old inline code for users with NO settings doc on the
 * INSTANT path (defaults: not muted, INSTANT, all channels on).
 */
import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationType,
	NotificationTriggerType,
	SourceApp,
	Statement,
	StatementSubscription,
	type NotificationQueueItem,
	type NotificationSettings,
} from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { db } from '../index';
import { getDefaultQuestionType } from '../model/questionTypeDefaults';
import { FcmSubscriber, processFcmNotificationsImproved } from '../fn_notifications';
import { sendNotificationEmail } from './notificationEmail';

export interface NotifyOptions {
	/** Distinguishes the event for copy/analytics; defaults to STATEMENT_REPLY. */
	triggerType?: NotificationTriggerType;
	/** Origin app, used for per-app mute, deep links and the in-app `sourceApp` label. */
	sourceApp?: SourceApp;
	/** Deep-link the in-app center / push / email should open. */
	targetPath?: string;
}

interface SubscriberChannels {
	sub: StatementSubscription;
	inApp: boolean;
	push: boolean;
	email: boolean;
}

interface DeliveryDecision {
	deliver: boolean;
	frequency: NotificationFrequency;
	inApp: boolean;
	push: boolean;
	email: boolean;
}

const SKIP: DeliveryDecision = {
	deliver: false,
	frequency: NotificationFrequency.NONE,
	inApp: false,
	push: false,
	email: false,
};

/** Resolve whether/where to deliver for one user, from their settings + subscription. */
function resolveDelivery(
	settings: NotificationSettings | null,
	channels: SubscriberChannels,
	sourceApp: SourceApp | undefined,
	now: number,
): DeliveryDecision {
	// Master mute.
	if (settings?.muted) return SKIP;

	// Per-app mute.
	const perApp = sourceApp ? settings?.perApp?.[sourceApp] : undefined;
	if (perApp?.muted) return SKIP;

	// Per-discussion snooze.
	if (channels.sub.mutedUntil && channels.sub.mutedUntil > now) return SKIP;

	// Effective frequency: subscription overrides user default; default INSTANT.
	const frequency =
		channels.sub.notificationFrequency ??
		settings?.defaultFrequency ??
		NotificationFrequency.INSTANT;
	if (frequency === NotificationFrequency.NONE) return SKIP;

	// Channel switches (user-global, then per-app). Default on when unset.
	const inAppAllowed =
		(settings?.defaultChannels?.inApp ?? true) && (perApp?.channels?.inApp ?? true);
	const pushAllowed = (settings?.defaultChannels?.push ?? true) && (perApp?.channels?.push ?? true);
	const emailAllowed =
		(settings?.defaultChannels?.email ?? false) && (perApp?.channels?.email ?? true);

	return {
		deliver: true,
		frequency,
		inApp: channels.inApp && inAppAllowed,
		push: channels.push && pushAllowed,
		email: channels.email && emailAllowed,
	};
}

/** Batch-load per-user notification settings, deduped by uid. */
async function loadSettings(uids: string[]): Promise<Map<string, NotificationSettings | null>> {
	const map = new Map<string, NotificationSettings | null>();
	if (uids.length === 0) return map;

	const refs = uids.map((uid) => db.collection(Collections.notificationSettings).doc(uid));
	const snaps = await db.getAll(...refs);
	snaps.forEach((snap, i) => {
		map.set(uids[i], snap.exists ? (snap.data() as NotificationSettings) : null);
	});

	return map;
}

/** App-relative deep link to the replied-to discussion, for push/email/digest. */
function resolveTargetPath(opts: NotifyOptions, statement: Statement): string {
	if (opts.targetPath) return opts.targetPath;
	const app = opts.sourceApp ?? statement.sourceApp ?? SourceApp.MAIN;
	if (app === SourceApp.CHAT) return `/q/${statement.parentId}`;

	return `/statement/${statement.parentId}?focusId=${statement.statementId}`;
}

export async function notifyStatementSubscribers(
	statement: Statement,
	parentStatement: Statement,
	opts: NotifyOptions = {},
): Promise<void> {
	const [inAppSnap, pushSnap, emailSnap] = await Promise.all([
		db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statement.parentId)
			.where('getInAppNotification', '==', true)
			.get(),
		db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statement.parentId)
			.where('getPushNotification', '==', true)
			.get(),
		db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statement.parentId)
			.where('getEmailNotification', '==', true)
			.get(),
	]);

	// Merge by uid so a user subscribed on several channels is resolved once.
	const actorUid = statement.creator.uid;
	const byUid = new Map<string, SubscriberChannels>();
	const upsert = (sub: StatementSubscription, key: 'inApp' | 'push' | 'email') => {
		const uid = sub.user?.uid ?? sub.userId;
		if (!uid || uid === actorUid) return; // never notify the actor about their own post
		const existing = byUid.get(uid);
		if (existing) {
			existing[key] = true;
			if (key === 'push') existing.sub = sub; // prefer the doc carrying tokens
		} else {
			byUid.set(uid, {
				sub,
				inApp: key === 'inApp',
				push: key === 'push',
				email: key === 'email',
			});
		}
	};
	inAppSnap.docs.forEach((d) => upsert(d.data() as StatementSubscription, 'inApp'));
	pushSnap.docs.forEach((d) => upsert(d.data() as StatementSubscription, 'push'));
	emailSnap.docs.forEach((d) => upsert(d.data() as StatementSubscription, 'email'));

	if (byUid.size === 0) return;

	const settingsMap = await loadSettings([...byUid.keys()]);
	const now = Date.now();
	const questionType = statement.questionSettings?.questionType ?? getDefaultQuestionType();
	const creatorImage = statement.creator.photoURL ?? null; // Firestore rejects undefined
	const targetPath = resolveTargetPath(opts, statement);
	const sourceApp = opts.sourceApp ?? statement.sourceApp;
	const triggerType = opts.triggerType ?? NotificationTriggerType.STATEMENT_REPLY;
	const emailSubject = `New reply from ${statement.creator.displayName || 'someone'}`;

	const batch = db.batch();
	let batchWrites = 0;
	const fcmSubscribers: FcmSubscriber[] = [];
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
			batch.set(ref, newNotification);
			batchWrites++;
		}

		if (decision.frequency === NotificationFrequency.INSTANT) {
			// Interruptive channels delivered now.
			if (decision.push && channels.sub.tokens && channels.sub.tokens.length > 0) {
				for (const token of channels.sub.tokens) {
					fcmSubscribers.push({
						userId: uid,
						token,
						documentId: `${uid}_${statement.parentId}`,
					});
				}
			}
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
				batch.set(db.collection(Collections.notificationQueue).doc(queueItemId), item);
				batchWrites++;
			}
		}
	}

	if (batchWrites > 0) await batch.commit();

	if (fcmSubscribers.length > 0) {
		const sendResult = await processFcmNotificationsImproved(fcmSubscribers, statement);
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
