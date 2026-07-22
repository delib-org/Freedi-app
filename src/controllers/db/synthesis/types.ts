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
	/** Cosine ≥ this → near-duplicate. Synth band. */
	attachThreshold: number;
	/** Cosine in [clusterThreshold, attachThreshold) → topic-cluster band. */
	clusterThreshold: number;
	/** Cosine in [reviewLowerBound, clusterThreshold) → admin review band. */
	reviewLowerBound: number;
	/** Stamp canonical claims on ideas + catch same-meaning rewordings. */
	claimRegistryEnabled: boolean;
}

export const DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
	enabled: false,
	// `minEvaluators: 0` → trigger fires on every option creation with no
	// evaluation gate. Admins raise the bar per question in the panel.
	minEvaluators: 0,
	minConsensus: 0.0,
	// Three-band geometry — see functions/src/synthesis/pipeline/types.ts.
	attachThreshold: 0.85,
	clusterThreshold: 0.6,
	reviewLowerBound: 0.5,
	claimRegistryEnabled: false,
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
