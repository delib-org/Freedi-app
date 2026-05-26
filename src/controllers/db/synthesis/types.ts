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
	// `minEvaluators: 1` → trigger fires on the very first option creation.
	// Bump it in the admin panel for questions that should wait for some
	// evaluation signal before being considered for clustering.
	minEvaluators: 1,
	minConsensus: 0.0,
	// 0.85 auto-attach / 0.70 review band — see functions/src/synthesis/pipeline/types.ts
	attachThreshold: 0.85,
	reviewLowerBound: 0.7,
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
