import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	ITEMS_SUBCOLLECTION,
	PROCESS_BATCH_SIZE,
	QUEUE_COLLECTION,
	type QueueItem,
	type ProgressDoc,
	type QueueOperation,
} from './types';
import { estimateEtaMinutes, planQueueWake } from './runState';

function db() {
	return getFirestore();
}

interface EnqueueOptionInput {
	questionId: string;
	kind: 'process-option';
	optionId: string;
	forceProcess?: boolean;
	/**
	 * A pipeline re-queuing the option it is processing (debounced or failed
	 * spawn). An existing item keeps its history and counts one more attempt,
	 * so retries are bounded by MAX_ATTEMPTS; a plain enqueue resets attempts.
	 */
	retry?: boolean;
}

interface EnqueueRejudgeInput {
	questionId: string;
	kind: 'rejudge-medoid-pair';
	medoidPair: { a: string; b: string };
}

export type EnqueueInput = EnqueueOptionInput | EnqueueRejudgeInput;

/**
 * Deterministic item ID — re-enqueuing the same option (or medoid pair) is
 * idempotent because the doc id is stable. `.set(..., { merge: true })`
 * means two enqueue calls produce one document, not two.
 *
 * Medoid pairs are normalized (sorted) so (A,B) and (B,A) collapse.
 */
export function deriveItemId(input: EnqueueInput): string {
	if (input.kind === 'process-option') {
		return `opt-${input.optionId}`;
	}
	const sorted = [input.medoidPair.a, input.medoidPair.b].sort();

	return `rj-${sorted[0]}-${sorted[1]}`;
}

export async function enqueueItem(input: EnqueueInput): Promise<string> {
	const itemId = deriveItemId(input);
	const ref = db()
		.collection(QUEUE_COLLECTION)
		.doc(input.questionId)
		.collection(ITEMS_SUBCOLLECTION)
		.doc(itemId);

	const payload: QueueItem = {
		itemId,
		questionId: input.questionId,
		kind: input.kind,
		enqueuedAt: Date.now(),
		attempts: 0,
		...(input.kind === 'process-option'
			? { optionId: input.optionId, forceProcess: input.forceProcess ?? false }
			: { medoidPair: input.medoidPair }),
	};

	try {
		if (input.kind === 'process-option' && input.retry) {
			await db().runTransaction(async (tx) => {
				const snap = await tx.get(ref);
				const attempts = snap.exists ? ((snap.data() as QueueItem).attempts ?? 0) + 1 : 0;
				tx.set(ref, { ...payload, attempts }, { merge: true });
			});
		} else {
			await ref.set(payload, { merge: true });
		}

		return itemId;
	} catch (error) {
		logger.warn('synthesis.queue.enqueue: write failed', {
			itemId,
			questionId: input.questionId,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

export interface InitProgressInput {
	questionId: string;
	enqueuedCount: number;
	operation: QueueOperation;
	initiatedBy: string;
}

/**
 * Initialize the progress doc for a fresh run. Overwrites any prior progress
 * for this question — the caller is responsible for checking that no other
 * run is in flight (see `synthesizeNow` / `synthesizeSelected` callables).
 */
export async function initProgressDoc(input: InitProgressInput): Promise<void> {
	const ref = db().collection(QUEUE_COLLECTION).doc(input.questionId);
	const now = Date.now();
	const progress: ProgressDoc = {
		questionId: input.questionId,
		enqueuedCount: input.enqueuedCount,
		processedCount: 0,
		failedCount: 0,
		pendingCount: input.enqueuedCount,
		status: input.enqueuedCount > 0 ? 'running' : 'idle',
		operation: input.operation,
		rateHint: PROCESS_BATCH_SIZE,
		startedAt: now,
		lastTickAt: now,
		etaMinutes: estimateEtaMinutes(input.enqueuedCount),
		initiatedBy: input.initiatedBy,
	};
	await ref.set(progress);
}

/**
 * Merge additional items into a running progress doc. Used when a selective
 * synthesis call lands while a synthesize-now run is in flight — we just add
 * to the pending count rather than rejecting the call.
 */
export async function mergeIntoProgressDoc(
	questionId: string,
	addedCount: number,
	newOperation: QueueOperation,
): Promise<void> {
	const ref = db().collection(QUEUE_COLLECTION).doc(questionId);
	await db().runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) {
			throw new Error(`progress doc missing for question ${questionId}`);
		}
		const before = snap.data() as ProgressDoc;
		const enqueuedCount = before.enqueuedCount + addedCount;
		const pendingCount = before.pendingCount + addedCount;
		tx.update(ref, {
			enqueuedCount,
			pendingCount,
			operation: before.operation === newOperation ? before.operation : 'mixed',
			lastTickAt: Date.now(),
			etaMinutes: estimateEtaMinutes(pendingCount),
		});
	});
}

/**
 * Make sure a worker will drain `addedCount` items just enqueued by a caller
 * that does not own a run (re-judge revisits, claim mutations, live-trigger
 * retries). See `planQueueWake` for the rules.
 *
 * A started run is written with `update` when the doc exists, so a worker
 * lease still held from the previous run survives. Failure is logged and
 * swallowed: the items are already queued and the next admin run picks them up.
 */
export async function ensureQueueRun(
	questionId: string,
	addedCount: number,
	operation: QueueOperation,
): Promise<void> {
	if (addedCount <= 0) return;
	const ref = db().collection(QUEUE_COLLECTION).doc(questionId);
	try {
		await db().runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			const before = snap.exists ? (snap.data() as ProgressDoc) : null;
			const action = planQueueWake(before);
			if (action === 'leave') return;
			const now = Date.now();
			if (action === 'merge' && before) {
				const pendingCount = (before.pendingCount ?? 0) + addedCount;
				tx.update(ref, {
					enqueuedCount: (before.enqueuedCount ?? 0) + addedCount,
					pendingCount,
					operation: before.operation === operation ? before.operation : 'mixed',
					lastTickAt: now,
					etaMinutes: estimateEtaMinutes(pendingCount),
				});

				return;
			}
			const run: Partial<ProgressDoc> = {
				questionId,
				enqueuedCount: addedCount,
				processedCount: 0,
				failedCount: 0,
				pendingCount: addedCount,
				status: 'running',
				operation,
				rateHint: PROCESS_BATCH_SIZE,
				startedAt: now,
				lastTickAt: now,
				etaMinutes: estimateEtaMinutes(addedCount),
				initiatedBy: 'system',
			};
			if (snap.exists) tx.update(ref, run);
			else tx.set(ref, run);
		});
	} catch (error) {
		logger.warn('synthesis.queue.ensureQueueRun: failed; items stay queued', {
			questionId,
			addedCount,
			operation,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
