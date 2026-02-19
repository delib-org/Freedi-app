/**
 * ConsensusCalculator.ts - Pure mathematical functions for consensus and agreement.
 *
 * Implements the Mean - SEM (with Uncertainty Floor) algorithm used by the
 * Freedi platform to calculate consensus scores. All functions are pure
 * (deterministic, no side effects) with ZERO imports from React, Firebase,
 * or Redux.
 *
 * ============================================================================
 * ALGORITHM: Mean - SEM (with Uncertainty Floor)
 * ============================================================================
 *
 * Title: Confidence-Adjusted Score with Minimum Variance Assumption
 *
 * The standard Mean - SEM formula suffers from a "Zero Variance Loophole."
 * If a very small group (e.g., n=2 or n=3) has perfect agreement (all
 * ratings are identical), the standard deviation becomes 0, producing a
 * perfect score.
 *
 * To correct this, we introduce a Minimum Standard Deviation (s_min = 0.5).
 * This ensures that uncertainty can only approach zero as n increases, not
 * just because the sample happens to be uniform.
 *
 * Formula:
 *   Score = Mean - (s_adj / sqrt(n))
 *
 * Where:
 *   - n       = Number of evaluators
 *   - s       = Observed Sample Standard Deviation
 *   - s_min   = The Uncertainty Floor constant (0.5)
 *   - s_adj   = max(s, s_min)
 */

import { number, parse } from 'valibot';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * The Uncertainty Floor constant.
 *
 * Represents a "moderate disagreement" baseline assumption. On a scale
 * of -1 to 1, 0.5 represents moderate disagreement. Large samples with
 * genuine consensus will exceed this floor naturally.
 */
export const FLOOR_STD_DEV = 0.5;

// ============================================================================
// CORE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate the Standard Error of the Mean (SEM) with an Uncertainty Floor.
 *
 * Prevents the Zero Variance Loophole by imposing a minimum standard
 * deviation (`FLOOR_STD_DEV`). When the observed standard deviation is
 * lower than the floor, the floor value is used instead.
 *
 * @param sumEvaluations        - Sum of all evaluation values.
 * @param sumSquaredEvaluations - Sum of squared evaluation values (sum of xi^2).
 * @param numberOfEvaluators    - Number of evaluators.
 * @returns SEM = s_adj / sqrt(n), where s_adj = max(s, FLOOR_STD_DEV).
 */
export function calcStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators <= 1) return FLOOR_STD_DEV;

	// Mean
	const mean = sumEvaluations / numberOfEvaluators;

	// Variance: Var = (sum of xi^2 / n) - mean^2
	const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;
	const safeVariance = Math.max(0, variance);

	// Observed standard deviation
	const observedStdDev = Math.sqrt(safeVariance);

	// Apply the Uncertainty Floor
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

	// SEM = s_adj / sqrt(n)
	return adjustedStdDev / Math.sqrt(numberOfEvaluators);
}

/**
 * Calculate the consensus (agreement) score using Mean - SEM with Uncertainty Floor.
 *
 * The penalty is bounded by the available range from the mean to -1, ensuring
 * the result stays within a sensible range.
 *
 * @param sumEvaluations        - Sum of all evaluation values.
 * @param sumSquaredEvaluations - Sum of squared evaluation values (sum of xi^2).
 * @param numberOfEvaluators    - Number of evaluators.
 * @returns Consensus score (confidence-adjusted agreement with uncertainty floor).
 */
export function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	parse(number(), sumEvaluations);
	parse(number(), sumSquaredEvaluations);
	parse(number(), numberOfEvaluators);

	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

	// Proportional penalty bounded by available range to -1
	const availableRange = mean + 1;
	const penalty = Math.min(sem, availableRange);

	return mean - penalty;
}

/**
 * Calculate the squared difference for efficient sum-of-squares tracking.
 *
 * Used when updating evaluations to incrementally maintain the
 * `sumSquaredEvaluations` field: new^2 - old^2.
 *
 * @param newEvaluation - The new evaluation value.
 * @param oldEvaluation - The previous evaluation value.
 * @returns The difference in squared values.
 */
export function calcSquaredDiff(newEvaluation: number, oldEvaluation: number): number {
	return newEvaluation * newEvaluation - oldEvaluation * oldEvaluation;
}

// ============================================================================
// SIMPLE / LIGHTWEIGHT CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate a simple average (mean) consensus from a list of evaluation values.
 *
 * This is a lightweight alternative to `calcAgreement` that does not apply
 * the Uncertainty Floor or SEM penalty. Useful for quick previews or
 * contexts where statistical robustness is not required.
 *
 * @param evaluations - Array of objects containing a numeric `value`.
 * @returns The arithmetic mean of the values, or 0 if the array is empty.
 */
export function calculateSimpleConsensus(evaluations: { value: number }[]): number {
	if (evaluations.length === 0) return 0;

	const sum = evaluations.reduce((acc, e) => acc + e.value, 0);

	return sum / evaluations.length;
}

/**
 * Calculate an agreement score representing how much evaluators agree
 * with each other (as opposed to their average opinion).
 *
 * Returns a value between 0 (complete disagreement / high variance) and
 * 1 (perfect agreement / zero variance). Based on the complement of the
 * standard deviation: agreement = max(0, 1 - stdDev).
 *
 * @param evaluations - Array of objects containing a numeric `value`.
 * @returns Agreement score in [0, 1].
 */
export function calculateAgreementScore(evaluations: { value: number }[]): number {
	if (evaluations.length <= 1) return 1;

	const mean = evaluations.reduce((acc, e) => acc + e.value, 0) / evaluations.length;
	const variance =
		evaluations.reduce((acc, e) => acc + Math.pow(e.value - mean, 2), 0) / evaluations.length;

	// Higher variance means lower agreement
	return Math.max(0, 1 - Math.sqrt(variance));
}

/**
 * Calculate the average evaluation from running sums.
 *
 * @param sumEvaluations     - Sum of all evaluation values.
 * @param numberOfEvaluators - Number of evaluators.
 * @returns The arithmetic mean, or 0 when there are no evaluators.
 */
export function calculateAverageEvaluation(
	sumEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators <= 0) return 0;

	return sumEvaluations / numberOfEvaluators;
}
