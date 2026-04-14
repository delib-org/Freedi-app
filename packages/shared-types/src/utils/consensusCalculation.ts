/**
 * Consensus Calculation Utilities
 *
 * Implements the WizCol Deliberative Consensus System scoring engine.
 *
 * Core formula: C_p = μ_p - t_{α, n_p+k-1} · SEM*_p
 *
 * Key features:
 * - t-distribution multiplier for statistically calibrated confidence penalty
 * - Bayesian smoothing with k=2 phantom prior votes of 0
 * - Sample-size-aware Agreement Index: A_p = 1 - t · SEM*
 *
 * The same formula is used across:
 * - Firebase functions (evaluation)
 * - Sign app API (suggestion-evaluations)
 * - Any other consensus calculations
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Number of phantom prior votes of 0 for Bayesian smoothing */
export const BAYESIAN_PRIOR_K = 2;

/** Confidence level for one-sided t-test (α = 0.05) */
export const CONFIDENCE_ALPHA = 0.05;

/**
 * @deprecated Use BAYESIAN_PRIOR_K instead. Kept for backward compatibility.
 */
export const FLOOR_STD_DEV = 0.5;

// ============================================================================
// t-DISTRIBUTION CRITICAL VALUES
// ============================================================================

/**
 * Lookup table for one-sided t-distribution critical values at α = 0.05.
 * Key = degrees of freedom (df), value = t_{0.05, df}.
 *
 * For df > 120, the normal approximation z_{0.05} = 1.645 is used.
 */
const T_CRITICAL_TABLE: Record<number, number> = {
  1: 6.314,
  2: 2.920,
  3: 2.353,
  4: 2.132,
  5: 2.015,
  6: 1.943,
  7: 1.895,
  8: 1.860,
  9: 1.833,
  10: 1.812,
  11: 1.796,
  12: 1.782,
  13: 1.771,
  14: 1.761,
  15: 1.753,
  16: 1.746,
  17: 1.740,
  18: 1.734,
  19: 1.729,
  20: 1.725,
  25: 1.708,
  30: 1.697,
  40: 1.684,
  50: 1.676,
  60: 1.671,
  80: 1.664,
  100: 1.660,
  120: 1.658,
};

/** Normal approximation for large df */
const Z_ALPHA_005 = 1.645;

/** Sorted df keys for interpolation */
const DF_KEYS = Object.keys(T_CRITICAL_TABLE).map(Number).sort((a, b) => a - b);

/**
 * Returns the one-sided t-distribution critical value for α = 0.05.
 * Uses lookup table with linear interpolation for intermediate df values.
 * Falls back to z = 1.645 for df > 120.
 *
 * @param df - degrees of freedom (n_p + k - 1)
 */
export function tCritical(df: number): number {
  if (df <= 0) return Z_ALPHA_005;
  if (df >= 120) return Z_ALPHA_005;

  // Exact lookup
  if (T_CRITICAL_TABLE[df] !== undefined) {
    return T_CRITICAL_TABLE[df];
  }

  // Linear interpolation between nearest table entries
  let lower = DF_KEYS[0];
  let upper = DF_KEYS[DF_KEYS.length - 1];

  for (let i = 0; i < DF_KEYS.length - 1; i++) {
    if (DF_KEYS[i] <= df && DF_KEYS[i + 1] >= df) {
      lower = DF_KEYS[i];
      upper = DF_KEYS[i + 1];
      break;
    }
  }

  const tLower = T_CRITICAL_TABLE[lower];
  const tUpper = T_CRITICAL_TABLE[upper];
  const fraction = (df - lower) / (upper - lower);

  return tLower + fraction * (tUpper - tLower);
}

// ============================================================================
// BAYESIAN-SMOOTHED SEM (SEM*)
// ============================================================================

/**
 * Calculates the Bayesian-smoothed Standard Error of the Mean (SEM*).
 *
 * Instead of a hard floor on σ, we add k=2 phantom prior votes of 0
 * to the variance calculation. This smoothly decays as n grows.
 *
 * Formula:
 *   σ̂*_p = √[ (Σe²_{i,p} + k·0²) / (n_p + k - 1) ]
 *   SEM*_p = σ̂*_p / √(n_p + k)
 *
 * @param sumEvaluations - Sum of all evaluation values (Σe_i)
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σe²_i)
 * @param numberOfEvaluators - Number of real evaluators (n_p)
 * @returns SEM*_p (Bayesian-smoothed standard error)
 */
export function calcSmoothedSEM(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  const n = numberOfEvaluators;
  const k = BAYESIAN_PRIOR_K;

  // With no evaluators, return a high-uncertainty prior
  if (n <= 0) return 1;

  // The effective sample includes k phantom votes of 0.
  // The mean of the augmented sample:
  //   μ_aug = Σe_i / (n + k)  [since phantom votes are 0]
  // But for variance we use the raw sum of squares:
  //   σ̂* = √[ (Σe²_i + k·0²) / (n + k - 1) ]
  //       = √[ Σe²_i / (n + k - 1) ]
  // This is the Bessel-corrected std dev of the augmented sample.

  const denomDf = n + k - 1; // degrees of freedom for variance
  const smoothedVariance = sumSquaredEvaluations / denomDf;
  const smoothedStdDev = Math.sqrt(Math.max(0, smoothedVariance));

  // SEM* = σ̂* / √(n + k)
  return smoothedStdDev / Math.sqrt(n + k);
}

/**
 * @deprecated Use calcSmoothedSEM instead.
 * Kept for backward compatibility with code that imports calcStandardError.
 */
export function calcStandardError(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  return calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
}

// ============================================================================
// CONSENSUS SCORE (C_p)
// ============================================================================

/**
 * Calculates consensus score using the WizCol formula:
 *
 *   C_p = μ_p - t_{α, n_p+k-1} · SEM*_p
 *
 * The t-distribution multiplier provides a statistically calibrated
 * confidence penalty. Small samples face heavy penalty via heavy-tailed
 * t-values; large samples converge to the normal critical value.
 *
 * Bayesian smoothing (k=2 phantom priors) prevents small unanimous
 * samples from claiming zero variance.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σe²_i)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Consensus score C_p (confidence-adjusted)
 */
export function calcAgreement(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  if (numberOfEvaluators === 0) return 0;

  const n = numberOfEvaluators;
  const k = BAYESIAN_PRIOR_K;

  // Mean sentiment μ_p
  const mean = sumEvaluations / n;

  // Bayesian-smoothed SEM*
  const sem = calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, n);

  // t-distribution critical value with df = n + k - 1
  const df = n + k - 1;
  const t = tCritical(df);

  // C_p = μ_p - t · SEM*
  const penalty = t * sem;

  // Bound so result stays within [-1, 1]
  const availableRange = mean + 1;
  const boundedPenalty = Math.min(penalty, availableRange);

  return mean - boundedPenalty;
}

/**
 * Calculates consensus score for binary evaluations (+1/-1 votes).
 *
 * @param positiveEvaluations - Number of +1 votes
 * @param negativeEvaluations - Number of -1 votes
 * @returns Consensus score (confidence-adjusted)
 */
export function calcBinaryConsensus(
  positiveEvaluations: number,
  negativeEvaluations: number,
): number {
  const numberOfEvaluators = positiveEvaluations + negativeEvaluations;
  if (numberOfEvaluators === 0) return 0;

  const sumEvaluations = positiveEvaluations - negativeEvaluations;
  const sumSquaredEvaluations = positiveEvaluations + negativeEvaluations; // 1² = (-1)² = 1

  return calcAgreement(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
}

// ============================================================================
// MEAN SENTIMENT (μ_p) — companion metric
// ============================================================================

/**
 * Calculates the raw mean sentiment μ_p.
 *
 * This is the unbiased answer to "what does the community think?"
 * It is a descriptive statistic, not a ranking tool.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param numberOfEvaluators - Number of evaluators
 * @returns Mean sentiment in [-1, 1]
 */
export function calcMeanSentiment(
  sumEvaluations: number,
  numberOfEvaluators: number,
): number {
  if (numberOfEvaluators <= 0) return 0;

  return sumEvaluations / numberOfEvaluators;
}

// ============================================================================
// AGREEMENT INDEX (A_p) — companion metric
// ============================================================================

/** Default sampling quality for self-selected (open) participation */
export const DEFAULT_SAMPLING_QUALITY = 0.3;

/** Calibration constant for confidence index formula */
export const CONFIDENCE_CALIBRATION_CONSTANT = 5;

/**
 * Calculates the Agreement Index A_p: evaluator alignment + sample reliability.
 *
 * Formula: A_p = 1 - t_{α, n_p+k-1} · SEM*_p
 *
 * A_p ∈ [0, 1] is sample-size sensitive by design:
 * - 3 votes all +1 → A_p ≈ 0.45 (small sample can't claim high confidence)
 * - 1000 votes, 990 positive → A_p ≈ 0.99 (earned through evaluations)
 *
 * @param sumEvaluations - Sum of all evaluation values (Σe_i)
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σe²_i)
 * @param numberOfEvaluators - Number of evaluators (n_p)
 * @returns Agreement index in [0, 1]. 1 = high agreement + reliable sample
 */
export function calcAgreementIndex(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  if (numberOfEvaluators <= 0) return 0;

  const n = numberOfEvaluators;
  const k = BAYESIAN_PRIOR_K;

  const sem = calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, n);
  const df = n + k - 1;
  const t = tCritical(df);

  return Math.max(0, Math.min(1, 1 - t * sem));
}

/**
 * Calculates simple Like-mindedness: how similar evaluators' opinions are (0-1).
 *
 * Formula: L_p = 1 - SEM*_p
 *
 * This is the user-facing metric — intuitive and easy to understand.
 * Unlike calcAgreementIndex, it does NOT apply the t-distribution penalty,
 * so it reflects raw opinion similarity without confidence adjustment.
 *
 * @param sumEvaluations - Sum of all evaluation values (Σe_i)
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σe²_i)
 * @param numberOfEvaluators - Number of evaluators (n_p)
 * @returns Like-mindedness in [0, 1]. 1 = everyone voted the same
 */
export function calcLikeMindedness(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  if (numberOfEvaluators <= 0) return 0;

  const sem = calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

  return Math.max(0, Math.min(1, 1 - sem));
}

/**
 * Calculates the Confidence Index: how representative the sample is (0-1).
 *
 * Formula: Γ = (n·q) / (n·q + c·ln(N)·(N-n)/(N-1))
 *
 * Note: The WizCol paper's A_p already encodes sample-size sensitivity,
 * so this index is supplementary for cases where population size is known.
 *
 * @param numberOfEvaluators - n: number of evaluators
 * @param targetPopulation - N: target population size
 * @param samplingQuality - q: sampling quality (0-1]
 * @param calibrationConstant - c: calibration constant (default 5)
 * @returns Confidence index in range [0, 1]
 */
export function calcConfidenceIndex(
  numberOfEvaluators: number,
  targetPopulation: number,
  samplingQuality: number,
  calibrationConstant: number = CONFIDENCE_CALIBRATION_CONSTANT,
): number {
  if (numberOfEvaluators <= 0) return 0;
  if (targetPopulation <= 1) return 1;
  if (numberOfEvaluators >= targetPopulation) return 1;

  const nq = numberOfEvaluators * samplingQuality;
  const lnN = Math.log(targetPopulation);
  const denominator = nq + calibrationConstant * lnN * (targetPopulation - numberOfEvaluators) / (targetPopulation - 1);

  if (denominator <= 0) return 0;

  return Math.max(0, Math.min(1, nq / denominator));
}

// ============================================================================
// CONSENSUS THRESHOLD HELPERS
// ============================================================================

/** Default threshold for automatic paragraph removal */
export const DEFAULT_REMOVAL_THRESHOLD = -0.4;

/** Default threshold for automatic paragraph addition */
export const DEFAULT_ADDITION_THRESHOLD = 0.4;

/** Default minimum evaluators required for automatic actions */
export const DEFAULT_MIN_EVALUATORS = 3;

/**
 * Checks if a paragraph's consensus meets the automatic removal threshold.
 *
 * A paragraph is eligible for removal when its consensus score drops below
 * the removal threshold AND enough evaluators have participated.
 *
 * @param consensus - Current consensus score of the paragraph
 * @param evaluatorCount - Number of evaluators who voted
 * @param removalThreshold - Threshold below which removal triggers (default: -0.4)
 * @param minEvaluators - Minimum evaluators required (default: 3)
 * @returns true if the paragraph should be auto-removed
 */
export function meetsRemovalThreshold(
  consensus: number,
  evaluatorCount: number,
  removalThreshold: number = DEFAULT_REMOVAL_THRESHOLD,
  minEvaluators: number = DEFAULT_MIN_EVALUATORS
): boolean {
  return consensus <= removalThreshold && evaluatorCount >= minEvaluators;
}

/**
 * Checks if a suggestion's consensus meets the automatic addition threshold.
 *
 * A suggestion on an insertion point is eligible for addition when its
 * consensus score exceeds the addition threshold AND enough evaluators
 * have participated.
 *
 * @param consensus - Current consensus score of the suggestion
 * @param evaluatorCount - Number of evaluators who voted
 * @param additionThreshold - Threshold above which addition triggers (default: 0.4)
 * @param minEvaluators - Minimum evaluators required (default: 3)
 * @returns true if the suggestion should be auto-added as a new paragraph
 */
export function meetsAdditionThreshold(
  consensus: number,
  evaluatorCount: number,
  additionThreshold: number = DEFAULT_ADDITION_THRESHOLD,
  minEvaluators: number = DEFAULT_MIN_EVALUATORS
): boolean {
  return consensus >= additionThreshold && evaluatorCount >= minEvaluators;
}
