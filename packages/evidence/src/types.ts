/**
 * Pure, framework-agnostic contracts for the dialectical evidence engine.
 *
 * No Firebase, no AI SDK, no `@freedi/shared-types` runtime dependency. The
 * string-literal unions here mirror the enum *string values* in
 * `@freedi/shared-types` (`EvidenceRelation`, `DialogicType`) so a value of one
 * is structurally assignable to the other.
 *
 * The app, the Cloud Functions, and `corroboration.ts` depend only on these
 * contracts — never on a scorer's internals. Every verdict retains raw
 * `features` so a new scorer version can re-score history offline and be A/B'd.
 */

/** Classified relation of an evidence reply to its parent (mirrors `EvidenceRelation`). */
export type EvidenceRelation = 'corroborate' | 'falsify' | 'neutral';

/** Polarity of a dialectical node (mirrors `DialogicType`). */
export type DialecticPolarity = 'standard' | 'strengthen' | 'critique';

/** Provenance of a verdict — drives the authority rule (§3 of the plan). */
export type VerdictSource = 'ai' | 'user-fallback';

/** Node kinds relevant to containment + scoring (mirrors `StatementType` subset). */
export type NodeKind = 'question' | 'option' | 'evidence' | 'statement';

export interface EvidenceClassConfig {
  /** [0,1] Bayesian prior credibility for this class of evidence. */
  baseStrength: number;
  /** Human-readable label shown on the evidence badge. */
  label: string;
}

export interface EvidenceTaxonomy {
  version: string;
  classes: Record<string, EvidenceClassConfig>;
  /** Fallback baseStrength keyed by pill ('strengthen' | 'critique') when the
   *  scorer is unsure of the class. */
  fallbackByPill: Record<string, number>;
}

/**
 * The active evidence verdict on an evidence edge. Produced by an
 * `EvidenceScorer`; feeds `corroboration.ts` through four numeric seams:
 *  1. relation        → edge sign / dialecticType
 *  2. baseStrength     → per-node Bayesian prior (from evidenceClass)
 *  3. confidence       → prior firmness (blends prior toward 0.5)
 *  4. independenceFactor → aggregation discount (== effectiveWeight)
 */
export interface EvidenceVerdict {
  relation: EvidenceRelation;
  /** Key into `EvidenceTaxonomy.classes`. */
  evidenceClass: string;
  /** [0,1] prior credibility resolved from `evidenceClass`. */
  baseStrength: number;
  /** [0,1] scorer confidence in this verdict. */
  confidence: number;
  /** [0,1] dedup discount vs independent siblings. */
  independenceFactor: number;
  /** [0,1] weight applied inside the parent's noisy-OR. `== independenceFactor`
   *  (evidence quality enters once, via the prior — no double-counting). */
  effectiveWeight: number;
  /** Human-readable, contestable explanation. */
  rationale: string;
  source: VerdictSource;
  /** Set when confidence < τ_conf and the user's pill won direction. */
  lowConfidence?: boolean;
  /** Raw scorer features, retained for offline re-scoring / calibration. */
  features?: Record<string, unknown>;
}

export interface ScoreInput {
  parentText: string;
  statementText: string;
  threadContext?: string;
  /** The user's pill hint ('strengthen' | 'critique'). A hint, not authoritative. */
  userPillHint: DialecticPolarity;
}

/**
 * Swappable AI mechanism. The only contract the rest of the system knows about.
 * Implemented in `functions/` (it needs the Gemini SDK); never in this package.
 */
export interface EvidenceScorer {
  readonly version: string;
  score(input: ScoreInput): Promise<EvidenceVerdict>;
}

export interface IndependenceEstimator {
  readonly version: string;
  estimate(input: {
    candidate: Omit<EvidenceVerdict, 'independenceFactor' | 'effectiveWeight'>;
    siblingVerdicts: EvidenceVerdict[];
    embeddings?: { candidate: number[]; siblings: number[][] };
  }): Promise<number>; // independenceFactor ∈ [0,1]
}

export interface ConvergenceMetric {
  readonly version: string;
  /** @param optionCs corroboration scores of a question's option children. */
  compute(optionCs: number[]): number; // [0,1]
}
