import { RATE_VIEW } from '@/constants/common';
import type { RateBatchEntry, RateBatchFailure } from '@/redux/answerViews/answerViewsSlice';

/** What the Rate view knew when it last asked; null until this view has asked once. */
export interface LastAsk {
	ratings: number;
	answers: number;
	at: number;
}

export interface BatchRequestInput {
	entry: RateBatchEntry | undefined;
	/** Answers on screen that are still there and still unrated. */
	unratedShown: number;
	ratings: number;
	answerCount: number;
	lastAsk: LastAsk | null;
	failure: RateBatchFailure | undefined;
	now: number;
	/** This person's share of the spread added to the finished re-ask. */
	finishedSpreadMs?: number;
}

export type BatchRequestDecision =
	| { kind: 'ask' }
	| { kind: 'wait' }
	| { kind: 'ask-later'; delayMs: number };

const WAIT: BatchRequestDecision = { kind: 'wait' };
const ASK: BatchRequestDecision = { kind: 'ask' };

/**
 * When the Rate view asks the sampler. `lastAsk` is cleared when the view opens
 * or the tab returns, so those two moments can always ask.
 */
export function decideBatchRequest({
	entry,
	unratedShown,
	ratings,
	answerCount,
	lastAsk,
	failure,
	now,
	finishedSpreadMs = 0,
}: BatchRequestInput): BatchRequestDecision {
	if (failure) return lastAsk === null && now >= failure.retryAt ? ASK : WAIT;
	if (entry && unratedShown > 0) return WAIT;
	if (lastAsk === null) return ASK;
	if (!entry) return WAIT;
	if (entry.hasMore) return ratings === lastAsk.ratings ? WAIT : ASK;

	// Finished. Only new answers can change that, and at a bounded pace.
	if (answerCount <= lastAsk.answers) return WAIT;
	const interval = RATE_VIEW.FINISHED_REFRESH_MS + finishedSpreadMs;
	const waited = now - lastAsk.at;

	return waited >= interval ? ASK : { kind: 'ask-later', delayMs: interval - waited };
}

/** How long a failed view waits before it may try again. */
export function failureBackoffMs(failures: number): number {
	const delay = RATE_VIEW.FAILURE_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1);

	return Math.min(delay, RATE_VIEW.FAILURE_RETRY_MAX_MS);
}
