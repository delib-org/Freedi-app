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
	type ProgressDoc,
	type QueueItem,
} from './types';

/**
 * Scheduled synthesis queue worker.
 *
 * Runs every minute. For each question with `status: 'running'`, drains up to
 * `PROCESS_BATCH_SIZE` items. Each item runs through `runSinglePipeline`
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

	let processed = 0;
	let failed = 0;
	let llmCalls = 0;

	for (const itemDoc of batchSnap.docs) {
		const item = itemDoc.data() as QueueItem;
		try {
			await processItem(item);
			await itemDoc.ref.delete();
			processed++;
		} catch (error) {
			const attempts = (item.attempts ?? 0) + 1;
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (attempts >= MAX_ATTEMPTS) {
				await itemDoc.ref.update({
					attempts,
					lastError: errorMsg,
					failedAt: Date.now(),
				});
				failed++;
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
	}

	await updateProgress(questionId, processed, failed);
	logger.info('synthesisQueue.batch.complete', {
		questionId,
		processed,
		failed,
		llmCalls,
	});
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

async function updateProgress(
	questionId: string,
	processed: number,
	failed: number,
): Promise<void> {
	const ref = db().collection(QUEUE_COLLECTION).doc(questionId);
	await db().runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return;
		const before = snap.data() as ProgressDoc;
		const processedCount = (before.processedCount ?? 0) + processed;
		const failedCount = (before.failedCount ?? 0) + failed;
		const pendingCount = Math.max(0, (before.pendingCount ?? 0) - processed - failed);
		const etaMinutes = Math.ceil(pendingCount / PROCESS_BATCH_SIZE);
		tx.update(ref, {
			processedCount,
			failedCount,
			pendingCount,
			etaMinutes,
			lastTickAt: Date.now(),
			...(pendingCount === 0 ? { status: 'completed' } : {}),
		});
	});
}

async function maybeCompleteQuestion(questionId: string): Promise<void> {
	const ref = db().collection(QUEUE_COLLECTION).doc(questionId);
	await db().runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return;
		const before = snap.data() as ProgressDoc;
		if (before.status === 'running' && (before.pendingCount ?? 0) === 0) {
			tx.update(ref, {
				status: 'completed',
				lastTickAt: Date.now(),
			});
		}
	});
}

// FieldValue import is kept for future operations (e.g. arrayUnion on
// stage tracking); silence the unused warning explicitly.
void FieldValue;
