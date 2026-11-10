/**
 * Digest instead of an instant push for new answers in a very large question.
 *
 * Above LARGE_QUESTION_SUBSCRIBER_THRESHOLD subscribers, a new answer still
 * writes everyone's in-app notice at once, but sends no push or email. The first
 * such answer of a period claims one marker document for the question. The
 * hourly `sendLargeQuestionDigests` run finds due markers and creates one
 * notificationQueue item per person, which the queue trigger delivers. So a
 * person hears about a large question at most once a day however many answers
 * arrive, and the writes per answer do not grow with a held record each.
 *
 * Only people on INSTANT frequency are covered: anyone who chose DAILY or WEEKLY
 * keeps the held records and the schedule they chose.
 *
 * The marker is found through the existing (status, deliverAt) index. It uses
 * status SKIPPED because the queue processor ignores everything but PENDING.
 */
import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
	type NotificationQueueItem,
	type Statement,
} from '@freedi/shared-types';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import type { RoutableQueueItem } from '../engagement/notifications/channelRouter';
import { logError } from '../utils/errorHandling';
import { vetoesNewAnswers } from './answerNotifyGate';
import { CHUNK_COMMIT_MAX_ATTEMPTS } from './chunkedWrites';
import { LARGE_QUESTION_DIGEST_ITEM_PREFIX } from './largeQuestionDigestDelivery';
import { isInQuietHours, loadQuietHours, quietHoursEndAt } from './quietHours';
import { pushRecipientFromSubscription, resolveFcmSubscribers } from './resolvePushTokens';
import {
	EXCLUDED_SUBSCRIBER_ROLES,
	loadSettings,
	loadSubscribers,
	resolveDelivery,
	type DeliveryDecision,
	type SubscriberChannels,
} from './subscriberDelivery';

/** More subscribers than this and new answers go to the digest; exactly this many stay instant. */
export const LARGE_QUESTION_SUBSCRIBER_THRESHOLD = 200;

/** 08:00 in Israel in winter and 09:00 in summer. Quiet hours cover other time zones. */
export const LARGE_QUESTION_DIGEST_HOUR_UTC = 6;

/** The `userId` on a marker. Never a real uid, so a person's own digest cannot pick one up. */
export const LARGE_QUESTION_DIGEST_OWNER = '__large_question_digest__';

/** Markers handled per hourly run; any left over are due again in the next run. */
export const LARGE_QUESTION_DIGEST_RUN_LIMIT = 20;

/** Runs that may fail on one marker before it is marked failed and left alone. */
export const LARGE_QUESTION_DIGEST_MAX_RETRIES = 3;

const DIGEST_TITLE = 'New answers in a question you follow';
const DIGEST_BODY_MAX_LENGTH = 120;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRESTORE_ALREADY_EXISTS = 6;
const QUESTION_UNAVAILABLE = 'Question gone or hidden at delivery';

/** Local until these fields join NotificationQueueItem in shared-types. */
export type LargeQuestionDigestMarker = NotificationQueueItem & {
	firstAuthorUid?: string;
	multipleAuthors?: boolean;
};

export interface LargeQuestionDigestResult {
	markers: number;
	queued: number;
	errors: number;
}

export interface ScheduleDigestParams {
	statement: Statement;
	parentStatement: Statement;
	targetPath: string;
	sourceApp: SourceApp | undefined;
	now: number;
}

interface Recipient {
	uid: string;
	channels: SubscriberChannels;
	decision: DeliveryDecision;
}

export function shouldDigestInstead(isAnswer: boolean, subscriberCount: number): boolean {
	return isAnswer && subscriberCount > LARGE_QUESTION_SUBSCRIBER_THRESHOLD;
}

/** The next digest hour strictly after `now`. */
export function nextDigestAt(now: number): number {
	const today = new Date(now).setUTCHours(LARGE_QUESTION_DIGEST_HOUR_UTC, 0, 0, 0);

	return today > now ? today : today + DAY_MS;
}

/** A digest opens the question itself, not the one answer that happened to come first. */
function withoutFocus(path: string): string {
	return path.split('?')[0];
}

function isAlreadyExists(error: unknown): boolean {
	return (error as { code?: number }).code === FIRESTORE_ALREADY_EXISTS;
}

/** A second person answering means the first author has news in the digest too. */
async function noteAuthor(ref: DocumentReference, authorUid: string): Promise<void> {
	const snapshot = await ref.get();
	const marker = snapshot.data() as LargeQuestionDigestMarker | undefined;
	if (!marker || marker.multipleAuthors || marker.firstAuthorUid === authorUid) return;

	await ref.update({ multipleAuthors: true });
}

/**
 * Claims the digest for this question and period. Costs one write per answer; a
 * later answer in the period finds the marker there and adds nothing. A failure
 * is logged and not thrown: everyone already has the in-app notice, and the next
 * answer tries again.
 */
export async function scheduleLargeQuestionDigest(
	db: Firestore,
	{ statement, parentStatement, targetPath, sourceApp, now }: ScheduleDigestParams,
): Promise<void> {
	const deliverAt = nextDigestAt(now);
	const queueItemId = `largeQuestionDigest_${statement.parentId}_${deliverAt}`;
	const ref = db.collection(Collections.notificationQueue).doc(queueItemId);
	const authorUid = statement.creator.uid;
	const marker: LargeQuestionDigestMarker = {
		queueItemId,
		userId: LARGE_QUESTION_DIGEST_OWNER,
		title: DIGEST_TITLE,
		body: parentStatement.statement.slice(0, DIGEST_BODY_MAX_LENGTH),
		channels: [],
		sourceApp: sourceApp ?? SourceApp.MAIN,
		targetPath: withoutFocus(targetPath),
		deliverAt,
		frequency: NotificationFrequency.DAILY,
		triggerType: NotificationTriggerType.DAILY_DIGEST,
		statementId: statement.statementId,
		parentId: statement.parentId,
		status: NotificationQueueStatus.SKIPPED,
		createdAt: now,
		firstAuthorUid: authorUid,
		multipleAuthors: false,
	};

	try {
		await ref.create(marker).catch(async (error: unknown) => {
			if (!isAlreadyExists(error)) throw error;
			await noteAuthor(ref, authorUid);
		});
	} catch (error) {
		logError(error, {
			operation: 'notifications.scheduleLargeQuestionDigest',
			statementId: statement.statementId,
			metadata: { parentId: statement.parentId, deliverAt },
		});
	}
}

function digestItemFor(
	uid: string,
	marker: LargeQuestionDigestMarker,
	channels: NotificationChannel[],
	pushTokens: string[],
	deliverAt: number | null,
	now: number,
): RoutableQueueItem {
	return {
		queueItemId: `${LARGE_QUESTION_DIGEST_ITEM_PREFIX}${uid}_${marker.parentId}_${marker.deliverAt}`,
		userId: uid,
		title: marker.title,
		body: marker.body,
		channels,
		sourceApp: marker.sourceApp,
		targetPath: marker.targetPath,
		deliverAt,
		frequency: NotificationFrequency.DAILY,
		triggerType: NotificationTriggerType.DAILY_DIGEST,
		parentId: marker.parentId,
		status: NotificationQueueStatus.PENDING,
		createdAt: now,
		...(pushTokens.length > 0 ? { pushTokens } : {}),
	};
}

/** The question may have been deleted or hidden since the marker was written. */
async function isQuestionAvailable(db: Firestore, parentId: string): Promise<boolean> {
	const snapshot = await db.collection(Collections.statements).doc(parentId).get();

	return snapshot.exists && !(snapshot.data() as Statement).hide;
}

/** Who may still hear about this question, decided at delivery time. */
async function findRecipients(
	db: Firestore,
	marker: LargeQuestionDigestMarker,
	now: number,
): Promise<Recipient[]> {
	const subscribers = await loadSubscribers(db, marker.parentId ?? '');
	for (const [uid, channels] of subscribers) {
		if (
			vetoesNewAnswers(channels.sub) ||
			EXCLUDED_SUBSCRIBER_ROLES.includes(channels.sub.role) ||
			(uid === marker.firstAuthorUid && !marker.multipleAuthors)
		) {
			subscribers.delete(uid);
		}
	}

	const settings = await loadSettings(db, [...subscribers.keys()]);
	const recipients: Recipient[] = [];
	for (const [uid, channels] of subscribers) {
		const decision = resolveDelivery(settings.get(uid) ?? null, channels, marker.sourceApp, now);
		if (decision.deliver && decision.frequency === NotificationFrequency.INSTANT) {
			recipients.push({ uid, channels, decision });
		}
	}

	return recipients;
}

/**
 * The same resolver as an instant push: subscription tokens as a fallback, no
 * app-tagged devices, each device once across everyone. Someone in quiet hours
 * keeps their tokens and gets a time to wait for.
 */
async function resolvePush(
	db: Firestore,
	recipients: Recipient[],
	now: number,
): Promise<{ tokensByUser: Map<string, string[]>; waitUntil: Map<string, number> }> {
	const pushRecipients = recipients
		.filter((recipient) => recipient.decision.push)
		.map((recipient) => pushRecipientFromSubscription(recipient.channels.sub));
	const tokensByUser = new Map<string, string[]>();
	for (const { userId, token } of await resolveFcmSubscribers(db, pushRecipients)) {
		tokensByUser.set(userId, [...(tokensByUser.get(userId) ?? []), token]);
	}

	const waitUntil = new Map<string, number>();
	const quietHours = await loadQuietHours(db, [...tokensByUser.keys()]);
	for (const [userId, config] of quietHours) {
		if (config && isInQuietHours(config, new Date(now))) {
			waitUntil.set(userId, quietHoursEndAt(config, now));
		}
	}

	return { tokensByUser, waitUntil };
}

async function buildDigestItems(
	db: Firestore,
	marker: LargeQuestionDigestMarker,
	now: number,
): Promise<RoutableQueueItem[]> {
	const recipients = await findRecipients(db, marker, now);
	const { tokensByUser, waitUntil } = await resolvePush(db, recipients, now);
	const items: RoutableQueueItem[] = [];

	for (const { uid, channels, decision } of recipients) {
		const ownerId = pushRecipientFromSubscription(channels.sub).userId;
		const tokens = decision.push ? (tokensByUser.get(ownerId) ?? []) : [];
		const itemChannels: NotificationChannel[] = [];
		if (tokens.length > 0) itemChannels.push(NotificationChannel.PUSH);
		if (decision.email) itemChannels.push(NotificationChannel.EMAIL);
		if (itemChannels.length === 0) continue;

		const deliverAt = tokens.length > 0 ? (waitUntil.get(ownerId) ?? null) : null;
		items.push(digestItemFor(uid, marker, itemChannels, tokens, deliverAt, now));
	}

	return items;
}

/**
 * Creates the items one by one, so someone an earlier or overlapping run already
 * queued is left alone and only that one write is refused. A set would put a
 * sent digest back to PENDING.
 */
async function createDigestItems(
	db: Firestore,
	items: RoutableQueueItem[],
): Promise<{ created: number; failed: number }> {
	const counts = { created: 0, failed: 0 };
	const writer = db.bulkWriter();
	writer.onWriteError(
		(error) => !isAlreadyExists(error) && error.failedAttempts < CHUNK_COMMIT_MAX_ATTEMPTS,
	);

	const writes = items.map((item) =>
		writer
			.create(db.collection(Collections.notificationQueue).doc(item.queueItemId), item)
			.then(() => {
				counts.created++;
			})
			.catch((error: unknown) => {
				if (!isAlreadyExists(error)) counts.failed++;
			}),
	);
	await writer.close();
	await Promise.all(writes);

	return counts;
}

async function recordFailedRun(
	markerRef: DocumentReference,
	marker: NotificationQueueItem,
	error: string,
	now: number,
): Promise<void> {
	const retryCount = (marker.retryCount ?? 0) + 1;
	const givenUp = retryCount >= LARGE_QUESTION_DIGEST_MAX_RETRIES;

	await markerRef.update({
		retryCount,
		error,
		...(givenUp ? { status: NotificationQueueStatus.FAILED, processedAt: now } : {}),
	});
}

/** Returns how many people were queued. Throws when the run must be repeated. */
async function deliverMarker(
	db: Firestore,
	markerRef: DocumentReference,
	marker: LargeQuestionDigestMarker,
	now: number,
): Promise<number> {
	if (!marker.parentId || !(await isQuestionAvailable(db, marker.parentId))) {
		await markerRef.update({
			status: NotificationQueueStatus.SENT,
			error: QUESTION_UNAVAILABLE,
			processedAt: now,
		});

		return 0;
	}

	const items = await buildDigestItems(db, marker, now);
	const { created, failed } = await createDigestItems(db, items);

	if (failed > 0) throw new Error(`${failed} digest items were not queued`);

	await markerRef.update({ status: NotificationQueueStatus.SENT, processedAt: now });

	return created;
}

/** Expands due markers into queue items, until the run's time budget is spent. */
export async function processLargeQuestionDigests(
	db: Firestore,
	now: number,
	hasTime: () => boolean = () => true,
): Promise<LargeQuestionDigestResult> {
	const result: LargeQuestionDigestResult = { markers: 0, queued: 0, errors: 0 };
	const due = await db
		.collection(Collections.notificationQueue)
		.where('status', '==', NotificationQueueStatus.SKIPPED)
		.where('deliverAt', '<=', now)
		.limit(LARGE_QUESTION_DIGEST_RUN_LIMIT)
		.get();

	for (const doc of due.docs) {
		if (!hasTime()) break;

		const marker = doc.data() as LargeQuestionDigestMarker;
		if (marker.userId !== LARGE_QUESTION_DIGEST_OWNER) continue;
		result.markers++;

		try {
			result.queued += await deliverMarker(db, doc.ref, marker, now);
		} catch (error) {
			result.errors++;
			logError(error, {
				operation: 'notifications.processLargeQuestionDigests',
				metadata: { parentId: marker.parentId, deliverAt: marker.deliverAt },
			});
			await recordFailedRun(
				doc.ref,
				marker,
				error instanceof Error ? error.message : String(error),
				now,
			).catch((updateError: unknown) => {
				logError(updateError, {
					operation: 'notifications.processLargeQuestionDigests.recordFailedRun',
					metadata: { parentId: marker.parentId },
				});
			});
		}
	}

	if (result.markers > 0) logger.info('Large question digests processed', { ...result });

	return result;
}
