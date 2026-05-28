import type { SynthesisSettings } from './types';

/**
 * Pure routing function: given a top-candidate cosine similarity and the
 * current synthesis settings, return the spawn mode (or non-spawn outcome)
 * the pipeline should take in Pass 3. Centralizing this logic gives a
 * single, testable surface for tuning band boundaries without re-reading
 * the full Pass 3 control flow.
 *
 *   [attachThreshold, ∞)        → 'spawn-synth' (the in-attach-band case
 *                                  reaches Pass 3 only when Pass 1's full
 *                                  evidence promotion fell short — still
 *                                  treat as synthesizable near-duplicates).
 *   [synthLowerBound, attachThreshold)
 *                               → 'spawn-synth' (LLM tries unified proposal;
 *                                  if it returns cannotSynthesize the
 *                                  caller falls back to topic-cluster).
 *   [clusterThreshold, synthLowerBound)
 *                               → 'spawn-topic-cluster' (skip the synth
 *                                  attempt entirely — distinct-but-related
 *                                  ideas in the same topic; cheaper
 *                                  generateTopicLabel call only).
 *   [reviewLowerBound, clusterThreshold)
 *                               → 'review' (gray-band, queue for admin).
 *   < reviewLowerBound          → 'singleton'.
 *
 * Why route by cosine band instead of by LLM verdict: empirically the
 * synth-judge prompt only returns `cannotSynthesize` on *directional*
 * conflict (per the prompt at integration-ai-service.ts ~line 460). Two
 * pro-aligned but distinct ideas at cosine ~0.70 are happily merged into
 * a single proposal that erases what made them distinct. Routing the
 * sub-synthLowerBound band directly to topic-cluster preserves that
 * structural distinction and avoids the wasted synth-prompt call.
 */
export type BandOutcome =
	| 'spawn-synth'
	| 'spawn-topic-cluster'
	| 'review'
	| 'singleton';

export function routeByCosine(similarity: number, settings: SynthesisSettings): BandOutcome {
	if (similarity >= settings.synthLowerBound) return 'spawn-synth';
	if (similarity >= settings.clusterThreshold) return 'spawn-topic-cluster';
	if (similarity >= settings.reviewLowerBound) return 'review';

	return 'singleton';
}
