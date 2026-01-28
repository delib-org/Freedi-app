/**
 * Adaptive Sampling Utilities for Thompson Sampling
 *
 * This module implements priority-based sampling with Thompson Sampling
 * for the multi-armed bandit problem in proposal evaluation.
 *
 * Based on adaptive sampling paper for deliberative democracy platforms.
 */

import { Statement } from '@freedi/shared-types';

/**
 * Configuration for the sampling algorithm
 */
export interface SamplingConfig {
  /** Minimum evaluations for statistical reliability */
  targetEvaluations: number;
  /** SEM threshold for stability */
  targetSEM: number;
  /** Thompson sampling weight (0-1) */
  explorationWeight: number;
  /** Window for new proposal boost in hours */
  recencyBoostHours: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  targetEvaluations: 30,
  targetSEM: 0.15,
  explorationWeight: 0.3,
  recencyBoostHours: 24,
};

/**
 * Uncertainty floor for SEM calculation
 * Ensures even single evaluations have meaningful uncertainty
 */
const FLOOR_STD_DEV = 0.5;

/**
 * Statistics calculated from aggregate evaluation data
 */
export interface ProposalStats {
  mean: number;
  sem: number;
  variance: number;
  evaluationCount: number;
}

/**
 * Calculate statistics from aggregate fields (O(1) complexity)
 * Uses the same algorithm as fn_evaluation.ts in the main app
 *
 * @param sumEvaluations - Sum of all evaluation scores
 * @param sumSquaredEvaluations - Sum of squared evaluation scores
 * @param numberOfEvaluators - Total number of evaluations
 */
export function calculateStatsFromAggregates(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number
): ProposalStats {
  if (numberOfEvaluators === 0) {
    return {
      mean: 0,
      sem: FLOOR_STD_DEV,
      variance: 0,
      evaluationCount: 0,
    };
  }

  const mean = sumEvaluations / numberOfEvaluators;

  if (numberOfEvaluators <= 1) {
    return {
      mean,
      sem: FLOOR_STD_DEV,
      variance: 0,
      evaluationCount: numberOfEvaluators,
    };
  }

  // Calculate variance: E[X^2] - (E[X])^2
  const variance = (sumSquaredEvaluations / numberOfEvaluators) - (mean * mean);
  const safeVariance = Math.max(0, variance);

  // Standard deviation with uncertainty floor
  const observedStdDev = Math.sqrt(safeVariance);
  const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

  // Standard error of the mean
  const sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);

  return {
    mean,
    sem,
    variance: safeVariance,
    evaluationCount: numberOfEvaluators,
  };
}

/**
 * Extract statistics from a Statement object
 * Uses the evaluation aggregate fields already present in Statement
 */
export function getProposalStats(proposal: Statement): ProposalStats {
  const evaluation = proposal.evaluation;

  if (!evaluation) {
    return {
      mean: 0,
      sem: FLOOR_STD_DEV,
      variance: 0,
      evaluationCount: 0,
    };
  }

  return calculateStatsFromAggregates(
    evaluation.sumEvaluations || 0,
    evaluation.sumSquaredEvaluations || 0,
    evaluation.numberOfEvaluators || 0
  );
}

/**
 * Calculate priority score for a proposal
 *
 * Formula: Priority = (0.4 * Base) + (0.25 * Uncertainty) + (0.2 * Recency) + (0.15 * TopMean)
 *
 * The TopMean bonus uses percentile rank to prioritize top-performing proposals
 * that still need validation (high SEM). This ensures leaders are validated
 * before they stabilize, rather than prioritizing borderline options.
 *
 * @param proposal - The statement to score
 * @param config - Sampling configuration
 * @param percentileRank - Optional percentile rank (0-1) where 1 = highest mean among all proposals
 */
export function calculatePriority(
  proposal: Statement,
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG,
  percentileRank?: number
): number {
  const stats = getProposalStats(proposal);

  // 1. Base priority: inverse of evaluation count (40%)
  // Under-evaluated proposals get higher priority
  const evalRatio = stats.evaluationCount / config.targetEvaluations;
  const basePriority = Math.max(0, 1 - evalRatio);

  // 2. Uncertainty bonus: high SEM needs more evaluations (25%)
  // Proposals with high variance need more data to reach statistical significance
  const uncertaintyBonus = stats.evaluationCount > 0
    ? Math.min(1, stats.sem / config.targetSEM)
    : 1; // New proposals get full uncertainty bonus

  // 3. Recency boost: newer proposals get temporary priority (20%)
  // Counteracts temporal bias where earlier submissions get more evaluations
  const hoursOld = (Date.now() - (proposal.createdAt || Date.now())) / (1000 * 60 * 60);
  const recencyBoost = hoursOld < config.recencyBoostHours
    ? 1 - (hoursOld / config.recencyBoostHours)
    : 0;

  // 4. Top-mean bonus: validate top performers relative to other proposals (15%)
  // Uses percentile rank (comparison to other proposals) combined with uncertainty.
  // High percentile + high SEM = leader that needs validation.
  // Low percentile = no bonus regardless of uncertainty (no need to validate losers).
  const topMeanBonus = stats.evaluationCount > 0 && percentileRank !== undefined
    ? Math.min(1, percentileRank * (stats.sem / config.targetSEM))
    : 0; // No bonus if no percentile provided or no evaluations yet

  // Combine factors with weights
  const priority =
    (basePriority * 0.4) +
    (uncertaintyBonus * 0.25) +
    (recencyBoost * 0.2) +
    (topMeanBonus * 0.15);

  return priority;
}

/**
 * Thompson sampling using Beta distribution approximation
 *
 * Models the proposal rating as a Beta distribution and samples from it.
 * This provides exploration/exploitation balance - sometimes picking
 * uncertain proposals over highly-rated ones.
 *
 * @param proposal - The statement to sample
 */
export function thompsonSample(proposal: Statement): number {
  const stats = getProposalStats(proposal);

  if (stats.evaluationCount === 0) {
    // No data - return uniform random (maximum exploration)
    return Math.random();
  }

  // Convert continuous ratings to positive/negative counts
  // Ratings are on scale -1 to 1, where positive > 0, negative < 0
  const avgRating = stats.mean;
  const count = stats.evaluationCount;

  // Estimate positive vs negative count from mean
  // mean = (positive - negative) / total
  // If mean = 0.5 with 10 evals: ~7.5 positive, ~2.5 negative
  const positiveEstimate = Math.round(count * (avgRating + 1) / 2);
  const negativeEstimate = count - positiveEstimate;

  // Beta distribution parameters with prior
  const alpha = positiveEstimate + 1;
  const beta = negativeEstimate + 1;

  // Approximate Beta sample using normal distribution
  // For large alpha + beta, Beta is approximately Normal
  const betaMean = alpha / (alpha + beta);
  const betaVariance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
  const betaStdDev = Math.sqrt(betaVariance);

  // Sample from Normal approximation and clamp to [0, 1]
  const sample = betaMean + (Math.random() - 0.5) * 2 * betaStdDev * 2;
  return Math.max(0, Math.min(1, sample));
}

/**
 * Check if a proposal has reached stability
 * Stable proposals have enough evaluations and low enough uncertainty
 * that further evaluations won't significantly change the result.
 *
 * @param proposal - The statement to check
 * @param config - Sampling configuration
 */
export function isStable(
  proposal: Statement,
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG
): boolean {
  const stats = getProposalStats(proposal);

  // Need minimum evaluations AND low SEM
  return stats.evaluationCount >= config.targetEvaluations &&
         stats.sem < config.targetSEM;
}

/**
 * Calculate adjusted priority with Thompson sampling exploration
 *
 * Combines deterministic priority (exploitation) with Thompson sample (exploration)
 * to balance between prioritizing known high-priority items and exploring uncertain ones.
 *
 * @param proposal - The statement to score
 * @param config - Sampling configuration
 * @param percentileRank - Optional percentile rank (0-1) for top-mean bonus calculation
 */
export function calculateAdjustedPriority(
  proposal: Statement,
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG,
  percentileRank?: number
): number {
  const deterministicPriority = calculatePriority(proposal, config, percentileRank);
  const explorationSample = thompsonSample(proposal);

  // Combine: (1 - weight) * priority + weight * exploration
  const exploitWeight = 1 - config.explorationWeight;
  const adjustedPriority =
    (exploitWeight * deterministicPriority) +
    (config.explorationWeight * explorationSample);

  return adjustedPriority;
}
