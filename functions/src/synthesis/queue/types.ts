export type QueueItemKind = 'process-option' | 'rejudge-medoid-pair';

export type QueueOperation = 'synthesizeNow' | 'selective' | 'rejudge' | 'mixed' | 'recluster';

export type QueueStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface QueueItem {
	itemId: string;
	questionId: string;
	kind: QueueItemKind;
	optionId?: string;
	medoidPair?: { a: string; b: string };
	forceProcess?: boolean;
	enqueuedAt: number;
	attempts: number;
	lastError?: string;
	failedAt?: number;
}

export interface ProgressDoc {
	questionId: string;
	enqueuedCount: number;
	processedCount: number;
	failedCount: number;
	pendingCount: number;
	status: QueueStatus;
	operation: QueueOperation;
	rateHint: number;
	startedAt: number;
	lastTickAt: number;
	etaMinutes: number;
	initiatedBy: string;
	lastError?: string;
	cancelledBy?: string;
	cancelledAt?: number;
	/**
	 * Set while a worker is draining this question. Stops a second scheduler
	 * tick from processing the same items, and stops a new run from starting
	 * (and dissolving clusters) while the previous worker finishes its item.
	 */
	workerLeaseUntil?: number;
}

export const QUEUE_COLLECTION = 'synthesisQueue';
export const ITEMS_SUBCOLLECTION = 'items';

/** Items per worker batch. Global constant for now; tune in prod from logs. */
export const PROCESS_BATCH_SIZE = 50;

/**
 * Rough wall time of one item (embedding + proposal + judge calls), from prod
 * logs (~7 s). Drives the ETA the admin sees — batch counts alone understate it.
 */
export const EST_SECONDS_PER_ITEM = 7;

/**
 * A worker stops taking new items after this long, well inside the 540 s
 * function timeout, so it never dies mid-item with progress unrecorded.
 */
export const WORKER_TIME_BUDGET_MS = 420_000;

/** Lease length — longer than the function timeout so a crashed worker's lease lapses on its own. */
export const WORKER_LEASE_MS = 600_000;

/** Max retry attempts per item before it's parked as failed. */
export const MAX_ATTEMPTS = 3;

/** How many questions a single worker tick handles in parallel. */
export const QUESTIONS_PER_TICK = 10;
