import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { functionConfig } from '@freedi/shared-types';
import { runSinglePipeline } from '../pipeline/runSinglePipeline';
import { rejudgeMedoidPair } from '../pipeline/rejudgeMedoidPair';
import {
	ITEMS_SUBCOLLECTION,
	MAX_ATTEMPTS,
	PROCESS_BATCH_SIZE,
	QUEUE_COLLECTION,
	QUESTIONS_PER_TICK,
	WORKER_LEASE_MS,
	WORKER_TIME_BUDGET_MS,
	type ProgressDoc,
	type QueueItem,
} from './types';
import { applyItemOutcome, canAcquireLease, type ItemOutcome } from './runState';

/**
 * Scheduled synthesis queue worker.
 *
 * Runs every minute. For each question with `status: 'running'`, takes a lease
 * on its progress doc (so overlapping ticks never share a question) and drains
 * up to `PROCESS_BATCH_SIZE` items, recording each one as it finishes. It stops
 * early when the run is paused, cancelled or replaced, or when the time budget
 * runs out. Each item runs through `runSinglePipeline`
 * (for `process-option` kinds) or `rejudgeMedoidPair` (for re-judge kinds).
 *
 * Idempotent: items are keyed by stable ID (see `deriveItemId`), so retrying
 * a partial batch never produces duplicate clusters. Items that exhaust
 * MAX_ATTEMPTS get parked with `failedAt` set; they remain in the items
 * collection for admin inspection but are filtered out of the worker's query.
 *
 * When a question's queue is empty, its progress doc transitions to
 * `completed`. The next tick won't see it (status filter).
 */

function db() {
	return getFirestore();
}

export const processSynthesisQueue = onSchedule(
	{
		schedule: 'every 1 minutes',
		timeZone: 'UTC',
		...functionConfig,
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async () => {
		const progressDocs = await db()
			.collection(QUEUE_COLLECTION)
			.where('status', '==', 'running')
			.limit(QUESTIONS_PER_TICK)
			.get();

		if (progressDocs.empty) return;

		logger.info('synthesisQueue.tick', { questions: progressDocs.size });

		for (const progressDoc of progressDocs.docs) {
			try {
				await processQuestionBatch(progressDoc.id);
			} catch (error) {
				logger.error('synthesisQueue: question batch failed', {
					questionId: progressDoc.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	},
);

async function processQuestionBatch(questionId: string): Promise<void> {
	const lease = await acquireLease(questionId);
	if (!lease) return;

	const tickStart = Date.now();
	let processed = 0;
	let failed = 0;
	let stoppedEarly = false;

	try {
		// Pull the batch. Filter out items that have exhausted retries.
		const batchSnap = await db()
			.collection(QUEUE_COLLECTION)
			.doc(questionId)
			.collection(ITEMS_SUBCOLLECTION)
			.where('attempts', '<', MAX_ATTEMPTS)
			.orderBy('attempts')
			.orderBy('enqueuedAt')
			.limit(PROCESS_BATCH_SIZE)
			.get();

		if (batchSnap.empty) {
			await maybeCompleteQuestion(questionId);

			return;
		}

		for (const itemDoc of batchSnap.docs) {
			if (Date.now() - tickStart > WORKER_TIME_BUDGET_MS) {
				stoppedEarly = true;
				break;
			}
			const item = itemDoc.data() as QueueItem;
			let outcome: ItemOutcome | null = null;
			try {
				await processItem(item);
				await itemDoc.ref.delete();
				outcome = 'processed';
			} catch (error) {
				const attempts = (item.attempts ?? 0) + 1;
				const errorMsg = error instanceof Error ? error.message : String(error);
				if (attempts >= MAX_ATTEMPTS) {
					await itemDoc.ref.update({
						attempts,
						lastError: errorMsg,
						failedAt: Date.now(),
					});
					outcome = 'failed';
					logger.error('synthesisQueue: item exhausted retries', {
						questionId,
						itemId: itemDoc.id,
						error: errorMsg,
					});
				} else {
					await itemDoc.ref.update({ attempts, lastError: errorMsg });
					logger.warn('synthesisQueue: item failed, will retry', {
						questionId,
						itemId: itemDoc.id,
						attempts,
						error: errorMsg,
					});
				}
			}

			// Record each item as it lands so the admin's bar moves item by item,
			// and stop as soon as the run is paused, cancelled or replaced.
			const keepGoing = outcome
				? await recordItemOutcome(questionId, lease.runStartedAt, outcome)
				: await isStillOurRun(questionId, lease.runStartedAt);
			if (outcome === 'processed') processed++;
			if (outcome === 'failed') failed++;
			if (!keepGoing) {
				stoppedEarly = true;
				break;
			}
		}
		if (!stoppedEarly) await maybeCompleteQuestion(questionId);
	} finally {
		await releaseLease(questionId, lease.leaseUntil);
	}

	logger.info('synthesisQueue.batch.complete', {
		questionId,
		processed,
		failed,
		stoppedEarly,
		elapsedMs: Date.now() - tickStart,
	});
}

interface Lease {
	runStartedAt: number;
	leaseUntil: number;
}

/** Claim the question for this worker, or null if it is not running or another worker holds it. */
async function acquireLease(questionId: string): Promise<Lease | null> {
	const ref = db().collection(QUEUE_COLLECTION).doc(questionId);

	return db().runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const progress = snap.exists ? (snap.data() as ProgressDoc) : null;
		const now = Date.now();
		if (!progress || !canAcquireLease(progress, now)) return null;
		const leaseUntil = now + WORKER_LEASE_MS;
		tx.update(ref, { workerLeaseUntil: leaseUntil });

		return { runStartedAt: progress.startedAt, leaseUntil };
	});
}

/** Drop the lease if it is still the one this worker wrote. */
async function releaseLease(questionId: string, leaseUntil: number): Promise<void> {
	const ref = db().collection(QUEUE_COLLECTION).doc(questionId);
	try {
		await db().runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists) return;
			const progress = snap.data() as ProgressDoc;
			if (progress.workerLeaseUntil !== leaseUntil) return;
			tx.update(ref, { workerLeaseUntil: FieldValue.delete() });
		});
	} catch (error) {
		// The lease lapses on its own after WORKER_LEASE_MS.
		logger.warn('synthesisQueue: lease release failed', {
			questionId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function recordItemOutcome(
	questionId: string,
	runStartedAt: number,
	outcome: ItemOutcome,
): Promise<boolean> {
	const ref = db().collection(QUEUE_COLLECTION).doc(questionId);

	return db().runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return false;
		const result = applyItemOutcome(snap.data() as ProgressDoc, runStartedAt, outcome, Date.now());
		if (result.update) tx.update(ref, result.update);

		return result.keepGoing;
	});
}

async function isStillOurRun(questionId: string, runStartedAt: number): Promise<boolean> {
	const snap = await db().collection(QUEUE_COLLECTION).doc(questionId).get();
	if (!snap.exists) return false;
	const progress = snap.data() as ProgressDoc;

	return progress.status === 'running' && progress.startedAt === runStartedAt;
}

async function processItem(item: QueueItem): Promise<void> {
	if (item.kind === 'process-option' && item.optionId) {
		await runSinglePipeline({
			optionId: item.optionId,
			source: 'queueWorker',
			forceProcess: item.forceProcess ?? false,
		});

		return;
	}
	if (item.kind === 'rejudge-medoid-pair' && item.medoidPair) {
		await rejudgeMedoidPair(item.medoidPair, item.questionId);

		return;
	}
	throw new Error(`unknown queue item kind: ${item.kind}`);
}

/** Mark the run completed once no workable items remain in its queue. */
async function maybeCompleteQuestion(questionId: string): Promise<void> {
	const questionRef = db().collection(QUEUE_COLLECTION).doc(questionId);
	const remaining = await questionRef
		.collection(ITEMS_SUBCOLLECTION)
		.where('attempts', '<', MAX_ATTEMPTS)
		.limit(1)
		.get();
	if (!remaining.empty) return;

	await db().runTransaction(async (tx) => {
		const snap = await tx.get(questionRef);
		if (!snap.exists) return;
		const before = snap.data() as ProgressDoc;
		if (before.status !== 'running') return;
		tx.update(questionRef, {
			status: 'completed',
			pendingCount: 0,
			etaMinutes: 0,
			lastTickAt: Date.now(),
		});
	});
}
