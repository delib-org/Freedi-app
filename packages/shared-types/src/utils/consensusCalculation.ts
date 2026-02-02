/**
 * Consensus Calculation Utilities
 *
 * Uses Mean - SEM (Standard Error of the Mean) formula with Uncertainty Floor.
 * This algorithm prevents small unanimous samples from achieving unrealistically
 * high scores while properly rewarding larger samples with genuine consensus.
 *
 * The same formula is used across:
 * - Firebase functions (fn_evaluation.ts)
 * - Sign app API (suggestion-evaluations)
 * - Any other consensus calculations
 */

/**
 * The Uncertainty Floor constant.
 *
 * Represents a "moderate disagreement" baseline assumption.
 * When sample variance is lower than this floor, we assume it's due to
 * insufficient sample size rather than true population consensus.
 *
 * Value of 0.5 chosen because:
 * - On a scale of -1 to 1, 0.5 represents moderate disagreement
 * - It provides meaningful penalty for small unanimous samples
 * - Large samples with genuine consensus will exceed this floor naturally
 */
export const FLOOR_STD_DEV = 0.5;

/**
 * Calculates the Standard Error of the Mean (SEM) with an Uncertainty Floor.
 *
 * This prevents small unanimous samples from achieving unrealistically high scores.
 * A sample of 3 unanimous votes cannot prove zero variance in the population.
 *
 * @param sumEvaluations - Sum of all evaluation values (Σxi)
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators (n)
 * @returns SEM = max(s, FLOOR_STD_DEV) / √n
 */
export function calcStandardError(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number
): number {
  if (numberOfEvaluators <= 1) return FLOOR_STD_DEV;

  // Calculate mean (μ)
  const mean = sumEvaluations / numberOfEvaluators;

  // Calculate variance using: Var = (Σxi² / n) - μ²
  const variance = (sumSquaredEvaluations / numberOfEvaluators) - (mean * mean);

  // Ensure variance is non-negative (floating point errors can cause small negative values)
  const safeVariance = Math.max(0, variance);

  // Calculate observed standard deviation: s = √Var
  const observedStdDev = Math.sqrt(safeVariance);

  // Apply the Uncertainty Floor: s_adj = max(s, s_min)
  const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

  // SEM = s_adj / √n
  return adjustedStdDev / Math.sqrt(numberOfEvaluators);
}

/**
 * Calculates consensus score using Mean - SEM approach with Uncertainty Floor.
 *
 * Formula: Score = Mean - min(SEM, Mean + 1)
 *
 * This replaces simple averaging with a statistically grounded approach that
 * accounts for both the level of support and the confidence in that measurement.
 *
 * Examples:
 * - 3 people vote +1.0: Score ≈ 0.71 (penalized for small sample)
 * - 100 people vote +0.95: Score ≈ 0.94 (floor usually doesn't trigger)
 * - Large sample defeats small unanimous sample correctly
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Consensus score (confidence-adjusted agreement)
 */
export function calcAgreement(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number
): number {
  // Handle edge case: no evaluators
  if (numberOfEvaluators === 0) return 0;

  // Calculate mean evaluation
  const mean = sumEvaluations / numberOfEvaluators;

  // Calculate Standard Error of the Mean (SEM)
  const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

  // Return confidence-adjusted score using proportional penalty
  // The penalty is bounded by the available range to -1, ensuring
  // the result naturally stays within [-1, 1]
  const availableRange = mean + 1; // Distance from mean to -1
  const penalty = Math.min(sem, availableRange);

  return mean - penalty;
}

/**
 * Calculates consensus score for binary evaluations (+1/-1 votes).
 *
 * This is a convenience function for systems using simple up/down votes.
 * For binary evaluations:
 * - sumEvaluations = positives - negatives
 * - sumSquaredEvaluations = positives + negatives (since 1² = (-1)² = 1)
 *
 * @param positiveEvaluations - Number of +1 votes
 * @param negativeEvaluations - Number of -1 votes
 * @returns Consensus score (confidence-adjusted agreement)
 */
export function calcBinaryConsensus(
  positiveEvaluations: number,
  negativeEvaluations: number
): number {
  const numberOfEvaluators = positiveEvaluations + negativeEvaluations;

  if (numberOfEvaluators === 0) return 0;

  // For binary evaluations (+1/-1):
  // sumEvaluations = positives - negatives
  // sumSquaredEvaluations = positives + negatives (since 1² = (-1)² = 1)
  const sumEvaluations = positiveEvaluations - negativeEvaluations;
  const sumSquaredEvaluations = positiveEvaluations + negativeEvaluations;

  return calcAgreement(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
}
