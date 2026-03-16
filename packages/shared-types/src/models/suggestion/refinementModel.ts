import { object, string, number, optional, picklist, InferOutput } from 'valibot';

/**
 * Refinement phase for a paragraph's suggestion collection process.
 * Stored on the official paragraph Statement at doc.refinement
 */
export const RefinementPhaseEnum = picklist(['open', 'refinement']);
export type RefinementPhase = InferOutput<typeof RefinementPhaseEnum>;

export const RefinementStateSchema = object({
	phase: RefinementPhaseEnum,
	transitionedAt: optional(number()),
	transitionedBy: optional(string()),
	consensusThreshold: optional(number()),
});

export type RefinementState = InferOutput<typeof RefinementStateSchema>;
