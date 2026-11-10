/**
 * Delivery of one person's large-question digest, and the sweep that rescues
 * digests cut off half way.
 *
 * Applies to digest items only, recognised by their id prefix; every other queue
 * item keeps the behaviour of queueProcessor. A transactional claim means an
 * overlapping trigger and sweep cannot both send. The sweep delivers directly,
 * because the queue trigger fires on document creation only and setting an item
 * back to PENDING would do nothing. A rare double digest is accepted in exchange
 * for never losing one: a run cut off after sending, before saving, sends again.
 */
import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';
import {
	FieldPath,
	FieldValue,
	getFirestore,
	type DocumentReference,
	type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import { routeToChannels, type RoutableQueueItem } from '../engagement/notifications/channelRouter';
import { logError } from '../utils/errorHandling';
import { vetoesNewAnswers } from './answerNotifyGate';
import { isInQuietHours, loadQuietHours, quietHoursEndAt } from './quietHours';
import { EXCLUDED_SUBSCRIBER_ROLES, loadSettings, resolveDelivery } from './subscriberDelivery';

export const LARGE_QUESTION_DIGEST_ITEM_PREFIX = 'largeQuestionDigestItem_';

/** A digest still PROCESSING after this long was cut off. */
export const DIGEST_ITEM_STUCK_MS = 15 * 60 * 1000;

/** Sweep attempts on one digest before it is given up on and logged. */
export const DIGEST_ITEM_MAX_RETRIES = 3;

/** Digests of each status (stuck, failed) taken by one sweep. */
export const DIGEST_ITEM_SWEEP_LIMIT = 100;

/** Digests that have waited out quiet hours, taken by one run; the rest carry over. */
export const DIGEST_ITEM_DUE_LIMIT = 1000;

/** Waiting digests delivered at once. */
export const DIGEST_ITEM_DUE_CONCURRENCY = 10;

/** A digest older than this is yesterday's news and is dropped instead of sent. */
export const DIGEST_ITEM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Range end for a document-id prefix query. */
const ID_PREFIX_END = '';

export interface DigestSweepResult {
	retried: number;
	gaveUp: number;
}

type ClaimDecision = 'claim' | 'giveUp' | 'leave';
type ClaimRule = (item: RoutableQueueItem, now: number) => ClaimDecision;
type Recheck =
	| { outcome: 'send'; channels: NotificationChannel[] }
	| { outcome: 'wait'; until: number }
	| { outcome: 'drop'; reason: string };

/** Waiting out someone's quiet hours. */
function isDeferred(item: RoutableQueueItem): boolean {
	return typeof item.deliverAt === 'number';
}

export function isLargeQuestionDigestItem(queueItemId: string): boolean {
	return queueItemId.startsWith(LARGE_QUESTION_DIGEST_ITEM_PREFIX);
}

/** A digest still waiting for someone's quiet hours to end is left alone. */
const claimPending: ClaimRule = (item, now) =>
	item.status === NotificationQueueStatus.PENDING && (item.deliverAt ?? 0) <= now
		? 'claim'
		: 'leave';

/** A sweep takes a failed digest, one whose claim went quiet, or one nobody ever claimed. */
const claimForSweep: ClaimRule = (item, now) => {
	const isFailed = item.status === NotificationQueueStatus.FAILED;
	const isStuck =
		item.status === NotificationQueueStatus.PROCESSING &&
		now - (item.processedAt ?? item.createdAt) >= DIGEST_ITEM_STUCK_MS;
	const isUnclaimed =
		item.status === NotificationQueueStatus.PENDING &&
		!isDeferred(item) &&
		now - item.createdAt >= DIGEST_ITEM_STUCK_MS;
	if (!isFailed && !isStuck && !isUnclaimed) return 'leave';

	return (item.retryCount ?? 0) >= DIGEST_ITEM_MAX_RETRIES ? 'giveUp' : 'claim';
};

/**
 * Leaves the statuses a sweep looks at, so a finished item cannot crowd out the
 * next run. `deliverAt` goes too: the marker query reads SKIPPED with a due time.
 */
function close(ref: DocumentReference, reason: string, now: number) {
	return ref.update({
		status: NotificationQueueStatus.SKIPPED,
		error: reason,
		processedAt: now,
		deliverAt: null,
		pushTokens: FieldValue.delete(),
	});
}

function giveUp(ref: DocumentReference, item: RoutableQueueItem, reason: string, now: number) {
	logError(new Error(reason), {
		operation: 'notifications.largeQuestionDigestDelivery.giveUp',
		userId: item.userId,
		metadata: { queueItemId: item.queueItemId, parentId: item.parentId },
	});

	return close(ref, reason, now);
}

async function claim(
	db: Firestore,
	ref: DocumentReference,
	rule: ClaimRule,
	countsAsRetry: boolean,
): Promise<{ decision: ClaimDecision; item: RoutableQueueItem | null }> {
	return db.runTransaction(async (transaction) => {
		const snapshot = await transaction.get(ref);
		if (!snapshot.exists) return { decision: 'leave' as const, item: null };

		const item = snapshot.data() as RoutableQueueItem;
		const now = Date.now();
		const decision = rule(item, now);
		if (decision !== 'claim') return { decision, item };

		const retryCount = (item.retryCount ?? 0) + (countsAsRetry ? 1 : 0);
		transaction.update(ref, {
			status: NotificationQueueStatus.PROCESSING,
			processedAt: now,
			retryCount,
		});

		return { decision, item: { ...item, retryCount } };
	});
}

async function recordFailure(
	ref: DocumentReference,
	item: RoutableQueueItem,
	reason: string,
): Promise<void> {
	const now = Date.now();
	if ((item.retryCount ?? 0) >= DIGEST_ITEM_MAX_RETRIES) {
		await giveUp(ref, item, reason, now);

		return;
	}

	await ref.update({ status: NotificationQueueStatus.FAILED, error: reason, processedAt: now });
}

/** Sends a claimed digest and records how it went. Tokens are not kept once delivered. */
async function send(ref: DocumentReference, item: RoutableQueueItem): Promise<void> {
	try {
		const results = await routeToChannels(item);
		const errors = results
			.filter((result) => !result.success)
			.map((result) => `${result.channel}: ${result.error}`)
			.join('; ');

		if (results.every((result) => !result.success)) {
			await recordFailure(ref, item, errors || 'No channel to deliver to');

			return;
		}

		await ref.update({
			status: NotificationQueueStatus.SENT,
			processedAt: Date.now(),
			pushTokens: FieldValue.delete(),
			...(errors ? { error: `Partial: ${errors}` } : {}),
		});
	} catch (error) {
		logError(error, {
			operation: 'notifications.largeQuestionDigestDelivery.send',
			userId: item.userId,
			metadata: { queueItemId: item.queueItemId },
		});
		await recordFailure(ref, item, error instanceof Error ? error.message : String(error));
	}
}

/** Hours may have passed since the item was written, so it is decided again now. */
async function recheckDeferred(
	db: Firestore,
	item: RoutableQueueItem,
	now: number,
): Promise<Recheck> {
	if (now - item.createdAt > DIGEST_ITEM_MAX_AGE_MS) {
		return { outcome: 'drop', reason: 'Digest too old to send' };
	}

	const parentId = item.parentId ?? '';
	const [question, subscription, settings] = await Promise.all([
		db.collection(Collections.statements).doc(parentId).get(),
		db.collection(Collections.statementsSubscribe).doc(`${item.userId}--${parentId}`).get(),
		loadSettings(db, [item.userId]),
	]);

	if (!question.exists || (question.data() as Statement).hide) {
		return { outcome: 'drop', reason: 'Question gone or hidden at delivery' };
	}
	const sub = subscription.data() as StatementSubscription | undefined;
	if (!sub || vetoesNewAnswers(sub) || EXCLUDED_SUBSCRIBER_ROLES.includes(sub.role)) {
		return { outcome: 'drop', reason: 'No longer subscribed at delivery' };
	}

	const decision = resolveDelivery(
		settings.get(item.userId) ?? null,
		{
			sub,
			inApp: Boolean(sub.getInAppNotification),
			push: Boolean(sub.getPushNotification),
			email: Boolean(sub.getEmailNotification),
		},
		item.sourceApp,
		now,
	);
	const channels = item.channels.filter((channel) =>
		channel === NotificationChannel.PUSH
			? decision.push
			: channel !== NotificationChannel.EMAIL || decision.email,
	);
	if (
		!decision.deliver ||
		decision.frequency !== NotificationFrequency.INSTANT ||
		channels.length === 0
	) {
		return { outcome: 'drop', reason: 'Muted at delivery' };
	}

	const quietHours = (await loadQuietHours(db, [item.userId])).get(item.userId);
	if (quietHours && isInQuietHours(quietHours, new Date(now))) {
		return { outcome: 'wait', until: quietHoursEndAt(quietHours, now) };
	}

	return { outcome: 'send', channels };
}

/** Sends a claimed digest, deciding again first if it spent time waiting. */
async function deliverClaimed(
	db: Firestore,
	ref: DocumentReference,
	item: RoutableQueueItem,
): Promise<void> {
	if (!isDeferred(item)) {
		await send(ref, item);

		return;
	}

	try {
		const now = Date.now();
		const recheck = await recheckDeferred(db, item, now);
		if (recheck.outcome === 'drop') {
			await close(ref, recheck.reason, now);
		} else if (recheck.outcome === 'wait') {
			await ref.update({
				status: NotificationQueueStatus.PENDING,
				deliverAt: recheck.until,
				processedAt: now,
			});
		} else {
			await send(ref, { ...item, channels: recheck.channels });
		}
	} catch (error) {
		logError(error, {
			operation: 'notifications.largeQuestionDigestDelivery.deliverClaimed',
			userId: item.userId,
			metadata: { queueItemId: item.queueItemId },
		});
		await recordFailure(ref, item, error instanceof Error ? error.message : String(error));
	}
}

/** Called by the queue processor when a digest item is created. */
export async function deliverDigestItem(queueItemId: string): Promise<void> {
	const db = getFirestore();
	const ref = db.collection(Collections.notificationQueue).doc(queueItemId);
	const { decision, item } = await claim(db, ref, claimPending, false);

	if (decision === 'claim' && item) await deliverClaimed(db, ref, item);
}

/**
 * The sweep's candidates of one status. PENDING asks for `deliverAt == null`, so
 * digests waiting out quiet hours cannot fill the limit and hide a lost one.
 */
async function findDigestItems(
	db: Firestore,
	status: NotificationQueueStatus,
): Promise<DocumentReference[]> {
	let candidates = db.collection(Collections.notificationQueue).where('status', '==', status);
	if (status === NotificationQueueStatus.PENDING) {
		candidates = candidates.where('deliverAt', '==', null);
	}

	const snapshot = await candidates
		.where(FieldPath.documentId(), '>=', LARGE_QUESTION_DIGEST_ITEM_PREFIX)
		.where(FieldPath.documentId(), '<', `${LARGE_QUESTION_DIGEST_ITEM_PREFIX}${ID_PREFIX_END}`)
		.limit(DIGEST_ITEM_SWEEP_LIMIT)
		.get();

	const now = Date.now();

	return snapshot.docs
		.filter((doc) => claimForSweep(doc.data() as RoutableQueueItem, now) !== 'leave')
		.map((doc) => doc.ref);
}

/** Delivers digests that were cut off, failed or never claimed. Bounded and logged. */
export async function sweepDigestItems(
	db: Firestore,
	hasTime: () => boolean = () => true,
): Promise<DigestSweepResult> {
	const result: DigestSweepResult = { retried: 0, gaveUp: 0 };
	const refs = [
		...(await findDigestItems(db, NotificationQueueStatus.PROCESSING)),
		...(await findDigestItems(db, NotificationQueueStatus.FAILED)),
		...(await findDigestItems(db, NotificationQueueStatus.PENDING)),
	];

	for (const ref of refs) {
		if (!hasTime()) break;

		try {
			const { decision, item } = await claim(db, ref, claimForSweep, true);
			if (decision === 'claim' && item) {
				result.retried++;
				await deliverClaimed(db, ref, item);
			} else if (decision === 'giveUp' && item) {
				result.gaveUp++;
				await giveUp(ref, item, 'Digest retries exhausted', Date.now());
			}
		} catch (error) {
			logError(error, {
				operation: 'notifications.sweepDigestItems',
				metadata: { queueItemId: ref.id },
			});
		}
	}

	if (result.retried > 0 || result.gaveUp > 0) logger.info('Digest sweep finished', { ...result });

	return result;
}

async function deliverDueItem(db: Firestore, ref: DocumentReference): Promise<boolean> {
	try {
		const { decision, item } = await claim(db, ref, claimPending, false);
		if (decision !== 'claim' || !item) return false;
		await deliverClaimed(db, ref, item);

		return true;
	} catch (error) {
		logError(error, {
			operation: 'notifications.deliverDueDigestItems',
			metadata: { queueItemId: ref.id },
		});

		return false;
	}
}

/**
 * Delivers digests whose quiet hours have ended, oldest first, through the
 * existing (status, deliverAt) index. Only digest items have a numeric deliverAt.
 * Stops when the budget is spent; what is left stays due for the next run.
 */
export async function deliverDueDigestItems(
	db: Firestore,
	now: number,
	hasTime: () => boolean = () => true,
): Promise<{ delivered: number }> {
	const due = await db
		.collection(Collections.notificationQueue)
		.where('status', '==', NotificationQueueStatus.PENDING)
		.where('deliverAt', '<=', now)
		.limit(DIGEST_ITEM_DUE_LIMIT)
		.get();
	const refs = due.docs.map((doc) => doc.ref).filter((ref) => isLargeQuestionDigestItem(ref.id));
	let delivered = 0;

	for (let start = 0; start < refs.length; start += DIGEST_ITEM_DUE_CONCURRENCY) {
		if (!hasTime()) break;

		const group = refs.slice(start, start + DIGEST_ITEM_DUE_CONCURRENCY);
		const outcomes = await Promise.all(group.map((ref) => deliverDueItem(db, ref)));
		delivered += outcomes.filter(Boolean).length;
	}

	if (refs.length > 0) logger.info('Waiting digests delivered', { due: refs.length, delivered });

	return { delivered };
}
