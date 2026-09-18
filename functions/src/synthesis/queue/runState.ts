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
