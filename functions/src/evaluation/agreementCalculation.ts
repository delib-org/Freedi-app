/**
 * Agreement and consensus calculation logic.
 *
 * Implements the WizCol Deliberative Consensus System scoring engine.
 * This module delegates core math to @freedi/shared-types and adds
 * Firebase-specific error handling and logging.
 *
 * Core formula: C_p = μ_p - t_{α, n_p+k-1} · SEM*_p
 *
 * Features:
 * - t-distribution multiplier for calibrated confidence penalty
 * - Bayesian smoothing with k=2 phantom prior votes of 0
 * - Sample-size-aware Agreement Index: A_p = 1 - t · SEM*
 */

import { logger } from 'firebase-functions/v1';
import { number, parse } from 'valibot';
import type { Statement, StatementEvaluation } from '@freedi/shared-types';
import {
	calcAgreementIndex,
	calcLikeMindedness,
	calcSmoothedSEM,
	calcAgreement as sharedCalcAgreement,
} from '@freedi/shared-types';
import type { ActionTypes, CalcDiff } from './evaluationTypes';

/**
 * @deprecated Use BAYESIAN_PRIOR_K from @freedi/shared-types.
 * Kept for backward compatibility.
 */
export const FLOOR_STD_DEV = 0.5;

/**
 * Calculates the Bayesian-smoothed SEM.
 * Delegates to shared-types implementation.
 *
 * @deprecated Use calcSmoothedSEM from @freedi/shared-types directly.
 */
export function calcStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	return calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
}

/**
 * Calculates consensus score using the WizCol formula:
 *   C_p = μ_p - t_{α, n_p+k-1} · SEM*_p
 *
 * Delegates to shared-types and adds Firebase error handling.
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

		return sharedCalcAgreement(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
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

	// Calculate Agreement Index (confidence-adjusted: 1 - t·SEM*)
	evaluation.agreementIndex = calcAgreementIndex(
		evaluation.sumEvaluations,
		evaluation.sumSquaredEvaluations || 0,
		evaluation.numberOfEvaluators,
	);

	// Calculate Like-mindedness (simple: 1 - SEM*)
	evaluation.likeMindedness = calcLikeMindedness(
		evaluation.sumEvaluations,
		evaluation.sumSquaredEvaluations || 0,
		evaluation.numberOfEvaluators,
	);

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
					proDiff: -Math.max(oldEvaluation, 0),
					conDiff: -Math.max(-oldEvaluation, 0),
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
