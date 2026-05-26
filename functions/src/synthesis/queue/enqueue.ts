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

function db() {
	return getFirestore();
}

interface EnqueueOptionInput {
	questionId: string;
	kind: 'process-option';
	optionId: string;
	forceProcess?: boolean;
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
		await ref.set(payload, { merge: true });

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
		etaMinutes: Math.ceil(input.enqueuedCount / PROCESS_BATCH_SIZE),
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
			etaMinutes: Math.ceil(pendingCount / PROCESS_BATCH_SIZE),
		});
	});
}
