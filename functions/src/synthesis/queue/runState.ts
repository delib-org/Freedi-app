import { EST_SECONDS_PER_ITEM, type ProgressDoc } from './types';

const SECONDS_PER_MINUTE = 60;

/** Minutes left for `pending` items at the observed per-item pace. */
export function estimateEtaMinutes(pending: number): number {
	return Math.ceil((Math.max(0, pending) * EST_SECONDS_PER_ITEM) / SECONDS_PER_MINUTE);
}

/**
 * True while a run is active OR a worker still holds the lease — e.g. just
 * after a cancel, while the worker finishes the item in hand. Starting a new
 * run then would dissolve clusters that worker is still writing.
 */
export function isRunInFlight(
	progress: Pick<ProgressDoc, 'status' | 'workerLeaseUntil'> | null | undefined,
	now: number,
): boolean {
	if (!progress) return false;
	if (progress.status === 'running' || progress.status === 'paused') return true;

	return (progress.workerLeaseUntil ?? 0) > now;
}

/** Whether a worker may take this question now; the caller then writes the lease. */
export function canAcquireLease(
	progress: Pick<ProgressDoc, 'status' | 'workerLeaseUntil'> | null | undefined,
	now: number,
): boolean {
	if (!progress || progress.status !== 'running') return false;

	return (progress.workerLeaseUntil ?? 0) <= now;
}

export type ItemOutcome = 'processed' | 'failed';

export interface OutcomeResult {
	/** Fields to write, or null when the item belongs to a run that no longer exists. */
	update: Partial<ProgressDoc> | null;
	/** Whether the worker should take another item. */
	keepGoing: boolean;
}

/**
 * Fold one finished item into the progress doc. `runStartedAt` identifies the
 * run the worker leased; if the doc now describes another run (cancel + new
 * run), nothing is written and the worker stops.
 */
export function applyItemOutcome(
	before: ProgressDoc,
	runStartedAt: number,
	outcome: ItemOutcome,
	now: number,
): OutcomeResult {
	if (before.startedAt !== runStartedAt) return { update: null, keepGoing: false };

	const processedCount = (before.processedCount ?? 0) + (outcome === 'processed' ? 1 : 0);
	const failedCount = (before.failedCount ?? 0) + (outcome === 'failed' ? 1 : 0);
	// Counts are display-only: the run completes when the queue is empty, not
	// when this reaches 0 (a drifted count must never strand queued items).
	const pendingCount = Math.max(0, (before.pendingCount ?? 0) - 1);

	return {
		update: {
			processedCount,
			failedCount,
			pendingCount,
			etaMinutes: estimateEtaMinutes(pendingCount),
			lastTickAt: now,
		},
		keepGoing: before.status === 'running',
	};
}

/**
 * What to do with an item's doc once its pipeline run returned.
 *
 * A pipeline that re-queues its own option (debounced or failed spawn) writes to
 * the same deterministic item id the worker is holding — deleting it afterwards
 * silently dropped every such retry. A re-queue always moves `enqueuedAt` and
 * counts an attempt, so a doc that no longer matches the one the worker picked
 * up is a retry and must stay.
 */
export type FinishedItemAction = 'delete' | 'keep-retry' | 'keep-exhausted' | 'gone';

export function resolveFinishedItem(
	picked: { enqueuedAt: number; attempts: number },
	current: { enqueuedAt: number; attempts: number } | null,
	maxAttempts: number,
): FinishedItemAction {
	if (!current) return 'gone';
	const requeued =
		current.enqueuedAt !== picked.enqueuedAt || (current.attempts ?? 0) !== (picked.attempts ?? 0);
	if (!requeued) return 'delete';

	return (current.attempts ?? 0) >= maxAttempts ? 'keep-exhausted' : 'keep-retry';
}

/**
 * How queued work reaches a worker. The worker only drains questions whose run
 * is `running`; anything enqueued outside one (a re-judge revisit, a claim
 * mutation, a retry from the live trigger) sat in the queue forever once the
 * run had completed — seen on Bq-VQPMPiG7b, 2026-09-18.
 *
 * - `merge`: a run is live — add the items to its counts.
 * - `start`: nothing is running — start a small run for them.
 * - `leave`: an admin paused or cancelled — respect it; the items wait.
 */
export type QueueWakeAction = 'merge' | 'start' | 'leave';

export function planQueueWake(
	progress: Pick<ProgressDoc, 'status'> | null | undefined,
): QueueWakeAction {
	if (!progress) return 'start';
	if (progress.status === 'running') return 'merge';
	if (progress.status === 'paused' || progress.status === 'cancelled') return 'leave';

	return 'start';
}
