/**
 * Agreement and consensus calculation logic.
 *
 * Implements the Mean - SEM (with Uncertainty Floor) algorithm for
 * calculating consensus scores. This module contains pure mathematical
 * functions with no database dependencies.
 *
 * ============================================================================
 * ALGORITHM: Mean - SEM (with Uncertainty Floor)
 * ============================================================================
 *
 * Title: Confidence-Adjusted Score with Minimum Variance Assumption
 * Status: Implemented
 *
 * ----------------------------------------------------------------------------
 * 1. THE PROBLEM (Why this is needed)
 * ----------------------------------------------------------------------------
 * The standard Mean - SEM formula suffers from a "Zero Variance Loophole."
 * If a very small group (e.g., n=2 or n=3) has perfect agreement (all ratings
 * are identical), the sample standard deviation (s) becomes 0. Consequently,
 * the Standard Error of the Mean (SEM) becomes 0, resulting in a perfect
 * score (Score = Mean).
 *
 * This creates a logic error where a tiny group with 3 votes of 1.0 (Score = 1.0)
 * mathematically defeats a large group of 100 people with a mean of 0.99
 * (Score < 0.99 due to natural variance). A sample size of 3 is insufficient
 * to statistically prove "zero variance" in a larger population.
 *
 * ----------------------------------------------------------------------------
 * 2. THE SOLUTION: The Uncertainty Floor
 * ----------------------------------------------------------------------------
 * To correct this, we introduce a Minimum Standard Deviation (s_min).
 * We assume that no controversial topic has zero variance in the general
 * population. If a small sample shows perfect agreement, we treat it as an
 * artifact of the small sample size and impose a "floor" on the variance
 * calculation.
 *
 * This ensures that uncertainty (SEM) can only approach zero as n increases,
 * not just because the sample happens to be uniform.
 *
 * ----------------------------------------------------------------------------
 * 3. THE FORMULA
 * ----------------------------------------------------------------------------
 *
 *   Score = Mean - (s_adj / sqrt(n))
 *
 * Where:
 *   - n       = Number of evaluators
 *   - s       = Observed Sample Standard Deviation
 *   - s_min   = The Uncertainty Floor constant (0.5)
 *   - s_adj   = Adjusted Standard Deviation = max(s, s_min)
 *
 * ----------------------------------------------------------------------------
 * 4. COMPARISON OF BEHAVIOR
 * ----------------------------------------------------------------------------
 *
 * Scenario A (The Flaw): 3 people vote 1.0
 *   - Old Formula: s=0 -> SEM=0 -> Score = 1.0
 *   - New Formula: s_adj=0.5 -> SEM = 0.5/sqrt(3) ~= 0.29 -> Score = 0.71
 *
 * Scenario B (The Goal): 100 people vote 0.95 (with normal variance)
 *   - Old Formula: Score ~= 0.94
 *   - New Formula: Score ~= 0.94 (The floor usually doesn't trigger for
 *                  large, noisy groups)
 *
 * Result: The large group (0.94) now correctly defeats the small group (0.71).
 */

import { logger } from 'firebase-functions/v1';
import { number, parse } from 'valibot';
import type { Statement, StatementEvaluation } from '@freedi/shared-types';
import type { ActionTypes, CalcDiff } from './evaluationTypes';

/**
 * The Uncertainty Floor constant.
 *
 * This represents a "moderate disagreement" baseline assumption.
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
 * Calculates the standard error of the mean (SEM) for evaluation data
 * with an Uncertainty Floor to prevent the Zero Variance Loophole.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (sum of xi^2)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Standard Error of the Mean (SEM = s_adj / sqrt(n)) where s_adj = max(s, FLOOR_STD_DEV)
 */
export function calcStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators <= 1) return FLOOR_STD_DEV; // Return floor for n=1 to ensure penalty

	// Calculate mean
	const mean = sumEvaluations / numberOfEvaluators;

	// Calculate variance using: Var = (sum of xi^2 / n) - mean^2
	const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;

	// Ensure variance is non-negative (floating point errors can cause small negative values)
	const safeVariance = Math.max(0, variance);

	// Calculate observed standard deviation: s = sqrt(Var)
	const observedStdDev = Math.sqrt(safeVariance);

	// Apply the Uncertainty Floor: s_adj = max(s, s_min)
	// This prevents the Zero Variance Loophole where small unanimous
	// samples achieve unrealistically perfect scores
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

	// Calculate SEM: SEM = s_adj / sqrt(n)
	const sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);

	return sem;
}

/**
 * Calculates consensus score using Mean - SEM approach with Uncertainty Floor.
 *
 * Formula: Score = Mean - (s_adj / sqrt(n))
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (sum of xi^2)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Consensus score (confidence-adjusted agreement with uncertainty floor)
 */
export function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	try {
		parse(number(), sumEvaluations);
		parse(number(), sumSquaredEvaluations);
		parse(number(), numberOfEvaluators);

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
		const agreement = mean - penalty;

		return agreement;
	} catch (error) {
		logger.error('Error calculating agreement:', error);

		return 0;
	}
}

/**
 * Calculates the squared difference for sum of squares tracking.
 * This is used to efficiently track sum of xi^2 for standard deviation calculation.
 */
export function calcSquaredDiff(newEvaluation: number, oldEvaluation: number): number {
	return newEvaluation * newEvaluation - oldEvaluation * oldEvaluation;
}

/**
 * Calculates the full evaluation object from a statement and evaluation diffs.
 *
 * @param statement - The current statement data
 * @param proConDiff - Pro/con differences
 * @param evaluationDiff - Net evaluation change
 * @param addEvaluator - Evaluator count change (+1, -1, or 0)
 * @param squaredEvaluationDiff - Squared evaluation difference
 * @returns Object containing agreement score and updated evaluation
 */
export function calculateEvaluation(
	statement: Statement,
	proConDiff: CalcDiff,
	evaluationDiff: number,
	addEvaluator: number,
	squaredEvaluationDiff: number,
): { agreement: number; evaluation: StatementEvaluation } {
	const evaluation: StatementEvaluation = statement.evaluation || {
		agreement: statement.consensus || 0,
		sumEvaluations: 0,
		numberOfEvaluators: statement.totalEvaluators || 0,
		sumPro: 0,
		sumCon: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		averageEvaluation: 0,
		sumSquaredEvaluations: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};

	if (statement.evaluation) {
		evaluation.sumEvaluations += evaluationDiff;
		evaluation.numberOfEvaluators += addEvaluator;
		evaluation.sumPro = (evaluation.sumPro || 0) + proConDiff.proDiff;
		evaluation.sumCon = (evaluation.sumCon || 0) + proConDiff.conDiff;
		// Track pro/con evaluator counts
		evaluation.numberOfProEvaluators =
			(evaluation.numberOfProEvaluators || 0) + proConDiff.proEvaluatorsDiff;
		evaluation.numberOfConEvaluators =
			(evaluation.numberOfConEvaluators || 0) + proConDiff.conEvaluatorsDiff;
		// Track sum of squared evaluations for standard deviation calculation
		evaluation.sumSquaredEvaluations =
			(evaluation.sumSquaredEvaluations || 0) + squaredEvaluationDiff;
		// Ensure averageEvaluation exists even for old data
		evaluation.averageEvaluation = evaluation.averageEvaluation ?? 0;
	} else {
		// For new evaluations, apply the diffs and evaluator count
		evaluation.sumEvaluations = evaluationDiff;
		evaluation.numberOfEvaluators = addEvaluator;
		evaluation.sumPro = proConDiff.proDiff;
		evaluation.sumCon = proConDiff.conDiff;
		evaluation.numberOfProEvaluators = proConDiff.proEvaluatorsDiff;
		evaluation.numberOfConEvaluators = proConDiff.conEvaluatorsDiff;
		evaluation.sumSquaredEvaluations = squaredEvaluationDiff;
	}

	// Ensure sumSquaredEvaluations is never negative (guard against data inconsistencies)
	evaluation.sumSquaredEvaluations = Math.max(0, evaluation.sumSquaredEvaluations || 0);
	// Ensure pro/con evaluator counts are never negative
	evaluation.numberOfProEvaluators = Math.max(0, evaluation.numberOfProEvaluators || 0);
	evaluation.numberOfConEvaluators = Math.max(0, evaluation.numberOfConEvaluators || 0);

	// Calculate average evaluation
	evaluation.averageEvaluation =
		evaluation.numberOfEvaluators > 0
			? evaluation.sumEvaluations / evaluation.numberOfEvaluators
			: 0;

	// Calculate consensus using new Mean - SEM formula
	const agreement = calcAgreement(
		evaluation.sumEvaluations,
		evaluation.sumSquaredEvaluations || 0,
		evaluation.numberOfEvaluators,
	);
	evaluation.agreement = agreement;

	return { agreement, evaluation };
}

/**
 * Calculates pro/con differences based on the evaluation action type.
 *
 * @param params - Object containing action, newEvaluation, and oldEvaluation
 * @returns CalcDiff with pro/con differences and evaluator count changes
 */
export function calcDiffEvaluation({
	action,
	newEvaluation,
	oldEvaluation,
}: {
	action: ActionTypes;
	newEvaluation: number;
	oldEvaluation: number;
}): CalcDiff {
	try {
		const positiveDiff = Math.max(newEvaluation, 0) - Math.max(oldEvaluation, 0);
		const negativeDiff = Math.min(newEvaluation, 0) - Math.min(oldEvaluation, 0);

		// Calculate evaluator count changes
		const wasPositive = oldEvaluation > 0;
		const wasNegative = oldEvaluation < 0;
		const isPositive = newEvaluation > 0;
		const isNegative = newEvaluation < 0;

		switch (action) {
			case 'new':
				return {
					proDiff: Math.max(newEvaluation, 0),
					conDiff: Math.max(-newEvaluation, 0),
					proEvaluatorsDiff: isPositive ? 1 : 0,
					conEvaluatorsDiff: isNegative ? 1 : 0,
				};
			case 'delete':
				return {
					proDiff: Math.min(-oldEvaluation, 0),
					conDiff: Math.max(oldEvaluation, 0),
					proEvaluatorsDiff: wasPositive ? -1 : 0,
					conEvaluatorsDiff: wasNegative ? -1 : 0,
				};
			case 'update': {
				// Calculate evaluator count changes for updates
				let proEvaluatorsDiff = 0;
				let conEvaluatorsDiff = 0;

				// Handle transitions between positive/negative/zero
				if (wasPositive && !isPositive) proEvaluatorsDiff -= 1;
				if (!wasPositive && isPositive) proEvaluatorsDiff += 1;
				if (wasNegative && !isNegative) conEvaluatorsDiff -= 1;
				if (!wasNegative && isNegative) conEvaluatorsDiff += 1;

				return {
					proDiff: positiveDiff,
					conDiff: -negativeDiff,
					proEvaluatorsDiff,
					conEvaluatorsDiff,
				};
			}
			default:
				throw new Error('Invalid action type');
		}
	} catch (error) {
		logger.error('Error calculating evaluation diff:', error);

		return { proDiff: 0, conDiff: 0, proEvaluatorsDiff: 0, conEvaluatorsDiff: 0 };
	}
}
