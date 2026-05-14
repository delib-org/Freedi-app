/**
 * Frontend mirror of the synthesis settings + queue progress types.
 *
 * Kept local rather than imported from @freedi/shared-types because the
 * shared package consumes a packaged tgz — adding fields requires a
 * coordinated rebuild. These types are read-only on the client (writes go
 * through the saveSynthesisSettings callable which validates server-side).
 */

export interface SynthesisSettings {
	enabled: boolean;
	minEvaluators: number;
	minConsensus: number;
	attachThreshold: number;
	reviewLowerBound: number;
}

export const DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
	enabled: false,
	minEvaluators: 3,
	minConsensus: 0.0,
	attachThreshold: 0.92,
	reviewLowerBound: 0.85,
};

export type SynthesisQueueStatus =
	| 'idle'
	| 'running'
	| 'paused'
	| 'completed'
	| 'failed'
	| 'cancelled';

export type SynthesisQueueOperation = 'synthesizeNow' | 'selective' | 'rejudge' | 'mixed';

export interface SynthesisProgress {
	questionId: string;
	enqueuedCount: number;
	processedCount: number;
	failedCount: number;
	pendingCount: number;
	status: SynthesisQueueStatus;
	operation: SynthesisQueueOperation;
	rateHint: number;
	startedAt: number;
	lastTickAt: number;
	etaMinutes: number;
	initiatedBy: string;
	lastError?: string;
	cancelledBy?: string;
	cancelledAt?: number;
}
