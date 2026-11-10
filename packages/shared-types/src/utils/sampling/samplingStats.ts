/**
 * Configuration and Bayesian statistics for adaptive sampling: the numbers the
 * priority formulas in `sampling.ts` are built from.
 */

import type { Statement } from '../../models/statement/StatementTypes';

/**
 * Configuration for the Bayesian sampling algorithm
 */
export interface SamplingConfig {
  /** Minimum evaluations for statistical reliability */
  targetEvaluations: number;
  /** SEM threshold for stability */
  targetSEM: number;
  /** UCB exploration parameter (kappa) - higher = more exploration */
  explorationKappa: number;
  /** Window for new proposal uncertainty boost in hours */
  recencyBoostHours: number;
  /** Prior strength (pseudo-count weight) */
  priorStrength: number;
  /** Prior mean (neutral starting point on [-1, 1] scale) */
  priorMean: number;
  /** Minimum selection probability for unstable proposals */
  explorationFloor: number;
}

/**
 * Default configuration values tuned for deliberative democracy
 */
export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  targetEvaluations: 30,
  targetSEM: 0.15,
  explorationKappa: 1.5,
  recencyBoostHours: 24,
  priorStrength: 2,
  priorMean: 0,
  explorationFloor: 0.1,
};

/**
 * Legacy config mapping for backward compatibility
 * Maps old explorationWeight to new explorationKappa
 */
export interface LegacySamplingConfig {
  targetEvaluations: number;
  targetSEM: number;
  explorationWeight?: number;
  explorationKappa?: number;
  recencyBoostHours: number;
  priorStrength?: number;
  priorMean?: number;
  explorationFloor?: number;
}

/**
 * Normalize config to handle legacy explorationWeight parameter
 */
export function normalizeConfig(config: LegacySamplingConfig): SamplingConfig {
  return {
    targetEvaluations: config.targetEvaluations,
    targetSEM: config.targetSEM,
    explorationKappa: config.explorationKappa ?? (config.explorationWeight ? config.explorationWeight * 5 : DEFAULT_SAMPLING_CONFIG.explorationKappa),
    recencyBoostHours: config.recencyBoostHours,
    priorStrength: config.priorStrength ?? DEFAULT_SAMPLING_CONFIG.priorStrength,
    priorMean: config.priorMean ?? DEFAULT_SAMPLING_CONFIG.priorMean,
    explorationFloor: config.explorationFloor ?? DEFAULT_SAMPLING_CONFIG.explorationFloor,
  };
}

/**
 * Base uncertainty for proposals with minimal data
 * Represents prior uncertainty on the [-1, 1] scale
 */
const BASE_UNCERTAINTY = 0.5;

/**
 * Minimum SEM floor to prevent division issues
 */
const MIN_SEM = 0.05;

/**
 * Statistics calculated from aggregate evaluation data with Bayesian prior
 */
export interface ProposalStats {
  /** Raw mean from evaluations only (legacy compatibility) */
  mean: number;
  /** Posterior mean after incorporating prior */
  posteriorMean: number;
  /** Standard error of the mean */
  sem: number;
  /** Sample variance */
  variance: number;
  /** Number of actual evaluations */
  evaluationCount: number;
  /** Effective sample size including prior */
  effectiveSampleSize: number;
}

/**
 * Calculate Bayesian statistics from aggregate fields
 *
 * Incorporates a conjugate prior (Normal-Normal model) to prevent
 * early evaluations from having outsized influence. A single negative
 * vote won't tank a proposal when prior strength provides ballast.
 *
 * @param sumEvaluations - Sum of all evaluation scores
 * @param sumSquaredEvaluations - Sum of squared evaluation scores
 * @param numberOfEvaluators - Total number of evaluations
 * @param config - Sampling configuration with prior settings
 */
export function calculateStatsFromAggregates(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): ProposalStats {
  const normalizedConfig = normalizeConfig(config as LegacySamplingConfig);
  const { priorStrength, priorMean } = normalizedConfig;

  // No evaluations - return prior-based estimates
  if (numberOfEvaluators === 0) {
    return {
      mean: 0,
      posteriorMean: priorMean,
      sem: BASE_UNCERTAINTY,
      variance: 0,
      evaluationCount: 0,
      effectiveSampleSize: priorStrength,
    };
  }

  // Calculate raw statistics
  const rawMean = sumEvaluations / numberOfEvaluators;

  // Bayesian posterior mean (weighted combination of prior and data)
  // This is the conjugate update for Normal-Normal model:
  // posterior_mean = (prior_strength * prior_mean + n * sample_mean) / (prior_strength + n)
  const effectiveSampleSize = numberOfEvaluators + priorStrength;
  const posteriorMean =
    (priorStrength * priorMean + sumEvaluations) / effectiveSampleSize;

  // Calculate sample variance: E[X^2] - (E[X])^2
  let variance = 0;
  let sem = BASE_UNCERTAINTY;

  if (numberOfEvaluators > 1) {
    variance = (sumSquaredEvaluations / numberOfEvaluators) - (rawMean * rawMean);
    variance = Math.max(0, variance); // Numerical safety for floating point

    // SEM calculation with uncertainty floor
    const observedStdDev = Math.sqrt(variance);
    const adjustedStdDev = Math.max(observedStdDev, BASE_UNCERTAINTY / 2);

    // Use effective sample size for SEM to account for prior
    sem = Math.max(MIN_SEM, adjustedStdDev / Math.sqrt(effectiveSampleSize));
  } else if (numberOfEvaluators === 1) {
    // Single evaluation: high uncertainty, tempered by prior
    sem = Math.max(MIN_SEM, BASE_UNCERTAINTY / Math.sqrt(effectiveSampleSize));
  }

  return {
    mean: rawMean,
    posteriorMean,
    sem,
    variance,
    evaluationCount: numberOfEvaluators,
    effectiveSampleSize,
  };
}

/**
 * Extract Bayesian statistics from a Statement object
 * Uses the evaluation aggregate fields already present in Statement
 *
 * @param proposal - The statement to analyze
 * @param config - Sampling configuration
 */
export function getProposalStats(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): ProposalStats {
  const evaluation = proposal.evaluation;

  if (!evaluation) {
    return calculateStatsFromAggregates(0, 0, 0, config);
  }

  return calculateStatsFromAggregates(
    evaluation.sumEvaluations || 0,
    evaluation.sumSquaredEvaluations || 0,
    evaluation.numberOfEvaluators || 0,
    config
  );
}
