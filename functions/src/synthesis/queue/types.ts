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
}

export const QUEUE_COLLECTION = 'synthesisQueue';
export const ITEMS_SUBCOLLECTION = 'items';

/** Items per worker batch. Global constant for now; tune in prod from logs. */
export const PROCESS_BATCH_SIZE = 50;

/** Max retry attempts per item before it's parked as failed. */
export const MAX_ATTEMPTS = 3;

/** How many questions a single worker tick handles in parallel. */
export const QUESTIONS_PER_TICK = 10;
