/**
 * Mean-SEM Algorithm for Consensus Scoring
 *
 * This module provides the core algorithm for calculating consensus scores
 * using the Mean - SEM (Standard Error of the Mean) approach with an
 * Uncertainty Floor to prevent the Zero Variance Loophole.
 *
 * Reference: "Consensus Scoring Update: From √n · Mean to Mean − SEM"
 * White Paper by Tal Yaron and Sivan Margalit, October 2025
 */

/**
 * Uncertainty Floor constant (s_min)
 *
 * This represents the minimum assumed standard deviation for any sample,
 * regardless of observed variance. The value 0.5 was chosen because:
 * - On a scale of -1 to 1, 0.5 represents moderate disagreement
 * - It provides meaningful penalty for small unanimous samples
 * - Large samples with genuine consensus will exceed this floor naturally
 */
export const FLOOR_STD_DEV = 0.5;

/**
 * Evaluation algorithm result containing computed values
 */
export interface EvaluationResult {
	agreement: number;
	mean: number;
	sem: number;
	standardDeviation: number;
	adjustedStandardDeviation: number;
}

/**
 * Calculates the squared difference for sum of squares tracking.
 * This is used to efficiently track Σxi² for standard deviation calculation.
 *
 * @param newEvaluation - The new evaluation value
 * @param oldEvaluation - The old evaluation value (0 for new evaluations)
 * @returns The difference in squared values: new² - old²
 */
export function calcSquaredDiff(newEvaluation: number, oldEvaluation: number): number {
	return (newEvaluation * newEvaluation) - (oldEvaluation * oldEvaluation);
}

/**
 * Calculates the standard error of the mean (SEM) for evaluation data
 * with an Uncertainty Floor to prevent the Zero Variance Loophole.
 *
 * The Uncertainty Floor ensures that small samples with artificially low
 * variance cannot achieve unrealistically high scores. This is critical
 * because a sample of 3 unanimous votes should not mathematically defeat
 * a large sample of 100 evaluators with natural variance.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Standard Error of the Mean (SEM = s_adj / √n) where s_adj = max(s, FLOOR_STD_DEV)
 */
export function calcStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
): number {
	if (numberOfEvaluators <= 1) return FLOOR_STD_DEV; // Return floor for n=1 to ensure penalty

	// Calculate mean (μ)
	const mean = sumEvaluations / numberOfEvaluators;

	// Calculate variance using: Var = (Σxi² / n) - μ²
	const variance = (sumSquaredEvaluations / numberOfEvaluators) - (mean * mean);

	// Ensure variance is non-negative (floating point errors can cause small negative values)
	const safeVariance = Math.max(0, variance);

	// Calculate observed standard deviation: s = √Var
	const observedStdDev = Math.sqrt(safeVariance);

	// Apply the Uncertainty Floor: s_adj = max(s, s_min)
	// This prevents the Zero Variance Loophole where small unanimous
	// samples achieve unrealistically perfect scores
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

	// Calculate SEM: SEM = s_adj / √n
	const sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);

	return sem;
}

/**
 * Calculates the raw standard error without the uncertainty floor.
 * This is useful for understanding the actual observed variance.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Raw Standard Error of the Mean (SEM = s / √n) without floor
 */
export function calcRawStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
): number {
	if (numberOfEvaluators <= 1) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	const variance = (sumSquaredEvaluations / numberOfEvaluators) - (mean * mean);
	const safeVariance = Math.max(0, variance);
	const stdDev = Math.sqrt(safeVariance);

	return stdDev / Math.sqrt(numberOfEvaluators);
}

/**
 * Calculates consensus score using Mean - SEM approach with Uncertainty Floor.
 *
 * This replaces the old heuristic formula (√n × Mean) with a statistically
 * grounded approach that accounts for both the level of support and the
 * confidence in that measurement.
 *
 * Formula: Score = Mean - min(SEM, availableRange)
 *
 * Where:
 * - Mean   = average evaluation score
 * - n      = number of evaluators
 * - s      = observed sample standard deviation
 * - s_min  = Uncertainty Floor constant (0.5)
 * - s_adj  = max(s, s_min) - prevents Zero Variance Loophole
 * - SEM    = s_adj / √n
 * - availableRange = mean + 1 (distance from mean to -1)
 *
 * The Uncertainty Floor prevents small unanimous groups from achieving
 * artificially perfect scores. A sample of 3 votes of 1.0 now scores ~0.71
 * instead of 1.0, correctly losing to a larger sample of 100 voters at 0.94.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Consensus score (confidence-adjusted agreement with uncertainty floor)
 */
export function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
): number {
	// Handle edge case: no evaluators
	if (numberOfEvaluators === 0) return 0;

	// Validate inputs
	if (typeof sumEvaluations !== 'number' || isNaN(sumEvaluations)) {
		return 0;
	}
	if (typeof sumSquaredEvaluations !== 'number' || isNaN(sumSquaredEvaluations)) {
		return 0;
	}
	if (typeof numberOfEvaluators !== 'number' || isNaN(numberOfEvaluators)) {
		return 0;
	}

	// Calculate mean evaluation
	const mean = sumEvaluations / numberOfEvaluators;

	// Calculate Standard Error of the Mean (SEM)
	const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

	// Return confidence-adjusted score using proportional penalty
	// The penalty is bounded by the available range to -1, ensuring
	// the result naturally stays within [-1, 1]
	const availableRange = mean + 1; // Distance from mean to -1
	const penalty = Math.min(sem, availableRange);
	const agreement = mean - penalty;

	return agreement;
}

/**
 * Calculates detailed evaluation statistics including all intermediate values.
 * This is useful for debugging and understanding the algorithm behavior.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Detailed evaluation result with all computed values
 */
export function calcEvaluationDetails(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
): EvaluationResult {
	if (numberOfEvaluators === 0) {
		return {
			agreement: 0,
			mean: 0,
			sem: 0,
			standardDeviation: 0,
			adjustedStandardDeviation: FLOOR_STD_DEV,
		};
	}

	const mean = sumEvaluations / numberOfEvaluators;

	// Calculate variance and standard deviation
	const variance = numberOfEvaluators > 1
		? (sumSquaredEvaluations / numberOfEvaluators) - (mean * mean)
		: 0;
	const safeVariance = Math.max(0, variance);
	const standardDeviation = Math.sqrt(safeVariance);

	// Apply uncertainty floor
	const adjustedStandardDeviation = Math.max(standardDeviation, FLOOR_STD_DEV);

	// Calculate SEM
	const sem = numberOfEvaluators > 1
		? adjustedStandardDeviation / Math.sqrt(numberOfEvaluators)
		: FLOOR_STD_DEV;

	// Calculate agreement
	const availableRange = mean + 1;
	const penalty = Math.min(sem, availableRange);
	const agreement = mean - penalty;

	return {
		agreement,
		mean,
		sem,
		standardDeviation,
		adjustedStandardDeviation,
	};
}

/**
 * Helper function to calculate sum of squared evaluations from an array of values.
 * This is useful for simulating scenarios in tests.
 *
 * @param evaluations - Array of evaluation values
 * @returns Sum of squared values (Σxi²)
 */
export function calcSumSquared(evaluations: number[]): number {
	return evaluations.reduce((sum, val) => sum + (val * val), 0);
}

/**
 * Helper function to calculate the sum of evaluations from an array.
 *
 * @param evaluations - Array of evaluation values
 * @returns Sum of values (Σxi)
 */
export function calcSum(evaluations: number[]): number {
	return evaluations.reduce((sum, val) => sum + val, 0);
}

/**
 * Simulates adding a new evaluation and returns the updated agreement score.
 * This is useful for testing incremental updates.
 *
 * @param currentSum - Current sum of evaluations
 * @param currentSumSquared - Current sum of squared evaluations
 * @param currentCount - Current number of evaluators
 * @param newEvaluation - The new evaluation to add
 * @returns Updated evaluation result
 */
export function simulateAddEvaluation(
	currentSum: number,
	currentSumSquared: number,
	currentCount: number,
	newEvaluation: number
): EvaluationResult {
	const newSum = currentSum + newEvaluation;
	const newSumSquared = currentSumSquared + (newEvaluation * newEvaluation);
	const newCount = currentCount + 1;

	return calcEvaluationDetails(newSum, newSumSquared, newCount);
}

/**
 * Simulates updating an evaluation and returns the updated agreement score.
 *
 * @param currentSum - Current sum of evaluations
 * @param currentSumSquared - Current sum of squared evaluations
 * @param currentCount - Current number of evaluators
 * @param oldEvaluation - The old evaluation value being replaced
 * @param newEvaluation - The new evaluation value
 * @returns Updated evaluation result
 */
export function simulateUpdateEvaluation(
	currentSum: number,
	currentSumSquared: number,
	currentCount: number,
	oldEvaluation: number,
	newEvaluation: number
): EvaluationResult {
	const newSum = currentSum - oldEvaluation + newEvaluation;
	const squaredDiff = calcSquaredDiff(newEvaluation, oldEvaluation);
	const newSumSquared = currentSumSquared + squaredDiff;

	return calcEvaluationDetails(newSum, newSumSquared, currentCount);
}

/**
 * Simulates deleting an evaluation and returns the updated agreement score.
 *
 * @param currentSum - Current sum of evaluations
 * @param currentSumSquared - Current sum of squared evaluations
 * @param currentCount - Current number of evaluators
 * @param deletedEvaluation - The evaluation being deleted
 * @returns Updated evaluation result
 */
export function simulateDeleteEvaluation(
	currentSum: number,
	currentSumSquared: number,
	currentCount: number,
	deletedEvaluation: number
): EvaluationResult {
	const newSum = currentSum - deletedEvaluation;
	const newSumSquared = currentSumSquared - (deletedEvaluation * deletedEvaluation);
	const newCount = currentCount - 1;

	return calcEvaluationDetails(newSum, Math.max(0, newSumSquared), newCount);
}

/**
 * Old formula for comparison (√n × Mean).
 * This is kept for comparison and migration purposes.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param numberOfEvaluators - Number of evaluators
 * @returns Old-style agreement score
 */
export function calcOldAgreement(sumEvaluations: number, numberOfEvaluators: number): number {
	if (numberOfEvaluators === 0) return 0;
	const mean = sumEvaluations / numberOfEvaluators;

	return mean * Math.sqrt(numberOfEvaluators);
}
