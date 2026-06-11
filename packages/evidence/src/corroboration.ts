/**
 * The recursive Popperian–Bayesian corroboration scorer (§1.2–1.3 of the plan).
 *
 * Every `option`/`evidence` node carries `C ∈ [0,1]`. A child's effect on its
 * parent is its own `C`; the **edge type only sets the sign** (`strengthen` +,
 * `critique` −). Pipeline:
 *   1. baseCredibility — Bayesian shrinkage of direct votes toward a per-node
 *      prior (`κ = N/(N+k)`); the prior + its firmness come from the evidence
 *      verdict (seams 2 & 3).
 *   2. sibling aggregation — independent supporters combine by **noisy-OR**,
 *      attackers likewise; each child's contribution is discounted by its
 *      `effectiveWeight` (== independenceFactor, seam 4).
 *   3. combine — base, support, attack combined by **DF-QuAD**.
 *   4. bottom-up — the tree is scored from the leaves up.
 *
 * Pure: no Firebase, no I/O. The heavy pass runs server-side; the client reads
 * the denormalized `corroborationScore`.
 */
import type { DialecticPolarity, NodeKind } from './types';

export interface ScorableStatement {
  id: string;
  parentId: string | null;
  statementType: NodeKind;
  /** Polarity of an evidence node — sets the sign of its contribution. */
  dialecticType?: DialecticPolarity;
  /** Sum of direct votes, each mapped to [0,1] (e.g. `(evaluation + 1) / 2`). */
  sum?: number;
  /** Number of direct votes. */
  N?: number;
  /** `p0_i = verdict.baseStrength`. Defaults to `cfg.prior` (neutral). */
  prior?: number;
  /** Verdict confidence in [0,1]. Defaults to 1. */
  confidence?: number;
  /** This node's weight into its parent's noisy-OR, [0,1]. Defaults to 1. */
  effectiveWeight?: number;
  children?: ScorableStatement[];
}

export interface CorroborationConfig {
  /** Neutral prior for nodes without an evidence class (e.g. options). */
  prior: number;
  /** Shrinkage strength: `κ = N/(N+k)`. Larger k ⇒ votes matter more slowly. */
  k: number;
}

export const DEFAULT_CORROBORATION_CONFIG: CorroborationConfig = {
  prior: 0.5,
  k: 4,
};

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;

  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Per-node base credibility (replaces a flat `cfg.prior`): the verdict's prior,
 * blended toward 0.5 by low confidence, then shrunk against direct votes.
 */
export function baseCredibility(node: ScorableStatement, cfg: CorroborationConfig): number {
  const p0 = node.prior ?? cfg.prior;
  const c = clamp01(node.confidence ?? 1);
  // seam 3: low confidence pulls the prior toward neutral so votes dominate sooner.
  const p0eff = c * p0 + (1 - c) * 0.5;
  const N = node.N ?? 0;
  const kappa = N / (N + cfg.k); // κ = N/(N+k), monotone increasing in N
  const vote = N > 0 ? (node.sum ?? 0) / N : p0eff;

  return clamp01(kappa * vote + (1 - kappa) * p0eff);
}

/**
 * DF-QuAD combination: base score `v0` combined with aggregated support `S` and
 * attack `A` (both in [0,1]). Bounded [0,1]; monotone; support raises toward 1,
 * attack lowers toward 0.
 */
export function dfQuad(v0: number, S: number, A: number): number {
  return S >= A ? v0 + (1 - v0) * (S - A) : v0 * (1 - (A - S));
}

/**
 * Recursively score `node` bottom-up. Returns `C ∈ [0,1]` for `option`/`evidence`.
 * Questions and chatter (`statement`) are not scored — they contribute nothing
 * to a parent's C and are skipped during aggregation.
 */
export function scoreNode(
  node: ScorableStatement,
  cfg: CorroborationConfig = DEFAULT_CORROBORATION_CONFIG,
): number {
  const Cbase = baseCredibility(node, cfg);

  // Only evidence children carry polarity and feed the parent's C.
  const evidenceChildren = (node.children ?? []).filter(
    (c) => c.statementType === 'evidence',
  );

  let supportProd = 1; // Π_supporting(1 - contribution)
  let attackProd = 1; // Π_attacking(1 - contribution)

  for (const child of evidenceChildren) {
    const childC = scoreNode(child, cfg);
    const contribution = clamp01((child.effectiveWeight ?? 1) * childC);
    if (child.dialecticType === 'critique') {
      attackProd *= 1 - contribution;
    } else {
      // 'strengthen' (and any non-critique evidence) supports the parent.
      supportProd *= 1 - contribution;
    }
  }

  const S = 1 - supportProd; // noisy-OR over independent supporters
  const A = 1 - attackProd; // noisy-OR over independent attackers

  return clamp01(dfQuad(Cbase, S, A));
}
