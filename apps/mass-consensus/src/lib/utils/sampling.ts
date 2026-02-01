/**
 * Advanced Adaptive Sampling for Deliberative Democracy
 *
 * This module implements a Bayesian UCB (Upper Confidence Bound) and
 * Gaussian Thompson Sampling strategy for the multi-armed bandit problem
 * in proposal evaluation.
 *
 * Key features:
 * - Bayesian Prior: Prevents early votes from unfairly biasing proposals
 * - UCB Vetting: High-potential proposals get priority for verification
 * - Gaussian Thompson Sampling: Proper continuous-scale exploration using Box-Muller
 * - Exploration Floor: Unstable proposals maintain minimum selection probability
 * - Temporal Dynamics: Recency affects uncertainty, not raw score
 * - Anti-Burial Recovery: Proposals with negative scores but high uncertainty get recovery chances
 *
 * Based on adaptive sampling principles for deliberative democracy platforms.
 */

import { Statement } from '@freedi/shared-types';

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
interface LegacySamplingConfig {
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
function normalizeConfig(config: LegacySamplingConfig): SamplingConfig {
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
 * Z-score for 95% confidence interval
 */
const Z_95 = 1.96;

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

/**
 * Calculate temporal uncertainty multiplier
 *
 * Recent proposals have their uncertainty inflated to encourage exploration.
 * This is more principled than adding a flat bonus - it affects the
 * confidence interval width rather than the score directly.
 *
 * The multiplier starts at 2.0x for brand new proposals and decays to 1.0x
 * over the recencyBoostHours window.
 *
 * @param proposal - The statement to evaluate
 * @param config - Sampling configuration
 * @returns Multiplier >= 1.0 for uncertainty inflation
 */
function getTemporalUncertaintyMultiplier(
  proposal: Statement,
  config: SamplingConfig
): number {
  const createdAt = proposal.createdAt || Date.now();
  const hoursOld = (Date.now() - createdAt) / (1000 * 60 * 60);

  if (hoursOld >= config.recencyBoostHours) {
    return 1.0; // No boost for older proposals
  }

  // Exponential decay: starts at 2.0x, decays to 1.0x over recencyBoostHours
  // This doubles the effective SEM for brand new proposals
  const recencyFactor = 1 - (hoursOld / config.recencyBoostHours);

  return 1.0 + recencyFactor;
}

/**
 * Calculate UCB (Upper Confidence Bound) priority score
 *
 * This implements the "vetting" logic: proposals that could potentially
 * be high-performing get priority for evaluation to verify their quality.
 *
 * Formula: UCB = posteriorMean + kappa * SEM * temporalMultiplier
 *
 * Key insight: A high mean with high uncertainty creates a very high UCB,
 * forcing the system to verify "potential winners" before declaring them stable.
 *
 * @param proposal - The statement to score
 * @param config - Sampling configuration
 */
export function calculateUCBPriority(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): number {
  const normalizedConfig = normalizeConfig(config as LegacySamplingConfig);
  const stats = getProposalStats(proposal, normalizedConfig);
  const temporalMultiplier = getTemporalUncertaintyMultiplier(proposal, normalizedConfig);

  // UCB formula: optimistic estimate of true value
  const explorationBonus = normalizedConfig.explorationKappa * stats.sem * temporalMultiplier;
  const ucb = stats.posteriorMean + explorationBonus;

  // Normalize to [0, 1] range (original scale is [-1, 1])
  // UCB can exceed 1 due to exploration bonus, which is intentional
  return (ucb + 1) / 2;
}

/**
 * Box-Muller transform for generating standard normal samples
 *
 * Generates a sample from the standard normal distribution N(0, 1).
 * More statistically rigorous than simple uniform approximations.
 *
 * Uses the polar form for numerical stability.
 *
 * @returns A sample from the standard normal distribution N(0, 1)
 */
function boxMullerSample(): number {
  let u1 = 0;
  let u2 = 0;

  // Avoid log(0) by ensuring u1 > 0
  while (u1 === 0) {
    u1 = Math.random();
  }
  u2 = Math.random();

  // Box-Muller transform (basic form)
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  return z;
}

/**
 * Gaussian Thompson Sampling
 *
 * Samples from the posterior distribution of the proposal's true mean.
 * Uses proper Gaussian sampling (Box-Muller) for the continuous rating scale [-1, 1].
 *
 * This provides natural exploration-exploitation balance:
 * - High-certainty proposals sample close to their mean
 * - High-uncertainty proposals sample across a wide range
 *
 * @param proposal - The statement to sample
 * @param config - Sampling configuration
 * @returns A sample from the posterior, normalized to [0, 1]
 */
export function gaussianThompsonSample(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): number {
  const normalizedConfig = normalizeConfig(config as LegacySamplingConfig);
  const stats = getProposalStats(proposal, normalizedConfig);
  const temporalMultiplier = getTemporalUncertaintyMultiplier(proposal, normalizedConfig);

  // Sample from N(posteriorMean, (SEM * temporalMultiplier)^2)
  const standardNormal = boxMullerSample();
  const adjustedSEM = stats.sem * temporalMultiplier;
  const sample = stats.posteriorMean + (standardNormal * adjustedSEM);

  // Normalize to [0, 1] range and clamp
  const normalized = (sample + 1) / 2;

  return Math.max(0, Math.min(1, normalized));
}

/**
 * Check if a proposal has reached statistical stability
 *
 * Stable proposals have sufficient evaluations and low enough uncertainty
 * that their ranking is unlikely to change significantly with more data.
 *
 * @param proposal - The statement to check
 * @param config - Sampling configuration
 */
export function isStable(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): boolean {
  const normalizedConfig = normalizeConfig(config as LegacySamplingConfig);
  const stats = getProposalStats(proposal, normalizedConfig);

  return (
    stats.evaluationCount >= normalizedConfig.targetEvaluations &&
    stats.sem < normalizedConfig.targetSEM
  );
}

/**
 * Calculate recovery score for potentially buried proposals
 *
 * Implements the "anti-burial" mechanism: proposals with low means but
 * high uncertainty deserve a chance to recover. A single early negative
 * vote shouldn't doom a proposal forever.
 *
 * Recovery priority is based on:
 * 1. Whether the 95% confidence interval crosses zero (high recovery need)
 * 2. The ratio of current SEM to target SEM (uncertainty level)
 *
 * @param proposal - The statement to evaluate
 * @param config - Sampling configuration
 * @returns Recovery priority score [0, 1]
 */
function calculateRecoveryScore(
  proposal: Statement,
  config: SamplingConfig
): number {
  const stats = getProposalStats(proposal, config);

  // Only apply recovery logic to proposals with negative posterior mean
  if (stats.posteriorMean >= 0) {
    return 0;
  }

  // Calculate uncertainty ratio
  const uncertaintyRatio = Math.min(2, stats.sem / config.targetSEM);

  // Check if 95% confidence interval crosses zero
  const lowerBound = stats.posteriorMean - (Z_95 * stats.sem);
  const upperBound = stats.posteriorMean + (Z_95 * stats.sem);
  const crossesZero = lowerBound < 0 && upperBound > 0;

  if (crossesZero) {
    // High recovery priority - we're not sure if this is truly negative
    // The more uncertain, the higher the recovery score
    return Math.min(1, uncertaintyRatio * 0.8);
  }

  // Even for proposals with clearly negative CIs, give some recovery chance
  // based on remaining uncertainty (they might recover with more data)
  return Math.min(0.5, uncertaintyRatio * 0.3);
}

/**
 * Calculate needs-more-data score for borderline proposals
 *
 * Proposals near the decision threshold (zero) need more evaluations
 * to determine which side they fall on.
 *
 * @param proposal - The statement to evaluate
 * @param config - Sampling configuration
 * @returns Priority boost for near-threshold proposals [0, 1]
 */
function calculateThresholdProximityScore(
  proposal: Statement,
  config: SamplingConfig
): number {
  const stats = getProposalStats(proposal, config);

  // Check if confidence interval crosses zero
  const lowerBound = stats.posteriorMean - (Z_95 * stats.sem);
  const upperBound = stats.posteriorMean + (Z_95 * stats.sem);

  if (lowerBound < 0 && upperBound > 0) {
    // Confidence interval crosses zero - high priority to resolve
    // Score based on how close the mean is to zero
    const distanceFromZero = Math.abs(stats.posteriorMean);
    const proximityScore = 1 - Math.min(1, distanceFromZero / stats.sem);

    return proximityScore * 0.8;
  }

  return 0;
}

/**
 * Calculate final adjusted priority combining all factors
 *
 * This is the main entry point for the sampling algorithm. It combines:
 * 1. UCB priority (vetting high-potential proposals)
 * 2. Gaussian Thompson sampling (exploration)
 * 3. Recovery score (anti-burial mechanism)
 * 4. Threshold proximity (borderline proposals need resolution)
 * 5. Exploration floor (minimum selection probability for unstable proposals)
 *
 * @param proposal - The statement to score
 * @param config - Sampling configuration
 */
export function calculateAdjustedPriority(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): number {
  const normalizedConfig = normalizeConfig(config as LegacySamplingConfig);
  const stable = isStable(proposal, normalizedConfig);

  // Stable proposals get minimal priority (they're already well-evaluated)
  if (stable) {
    // Small random tiebreaker prevents starvation and adds variety
    return 0.05 + (Math.random() * 0.05);
  }

  // Calculate component scores
  const ucbPriority = calculateUCBPriority(proposal, normalizedConfig);
  const thompsonSample = gaussianThompsonSample(proposal, normalizedConfig);
  const recoveryScore = calculateRecoveryScore(proposal, normalizedConfig);
  const thresholdScore = calculateThresholdProximityScore(proposal, normalizedConfig);

  // Combine UCB (exploitation/vetting) with Thompson (exploration)
  // UCB gets 55% weight for vetting, Thompson 45% for exploration
  const basePriority = (0.55 * ucbPriority) + (0.45 * thompsonSample);

  // Add bonus scores for special cases
  const bonuses = (recoveryScore * 0.15) + (thresholdScore * 0.1);
  const priorityWithBonuses = basePriority + bonuses;

  // Apply exploration floor for unstable proposals
  const finalPriority = Math.max(normalizedConfig.explorationFloor, priorityWithBonuses);

  return Math.min(1, finalPriority);
}

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * Calculate priority score for a proposal
 *
 * This is the legacy API that combines deterministic priority calculation.
 * For the full algorithm with Thompson sampling, use calculateAdjustedPriority.
 *
 * @deprecated Use calculateUCBPriority for deterministic priority
 * or calculateAdjustedPriority for the full algorithm
 *
 * @param proposal - The statement to score
 * @param config - Sampling configuration
 */
export function calculatePriority(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): number {
  return calculateUCBPriority(proposal, config);
}

/**
 * Thompson sampling using Gaussian distribution
 *
 * @deprecated Use gaussianThompsonSample instead for explicit naming
 *
 * @param proposal - The statement to sample
 */
export function thompsonSample(proposal: Statement): number {
  return gaussianThompsonSample(proposal, DEFAULT_SAMPLING_CONFIG);
}

// ============================================================================
// UTILITY EXPORTS FOR TESTING AND DEBUGGING
// ============================================================================

/**
 * Get detailed sampling diagnostics for a proposal
 *
 * Useful for debugging and understanding why a proposal has its current priority.
 *
 * @param proposal - The statement to analyze
 * @param config - Sampling configuration
 */
export function getSamplingDiagnostics(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG
): {
  stats: ProposalStats;
  isStable: boolean;
  ucbPriority: number;
  recoveryScore: number;
  thresholdScore: number;
  temporalMultiplier: number;
  adjustedPriority: number;
} {
  const normalizedConfig = normalizeConfig(config as LegacySamplingConfig);
  const stats = getProposalStats(proposal, normalizedConfig);

  return {
    stats,
    isStable: isStable(proposal, normalizedConfig),
    ucbPriority: calculateUCBPriority(proposal, normalizedConfig),
    recoveryScore: calculateRecoveryScore(proposal, normalizedConfig),
    thresholdScore: calculateThresholdProximityScore(proposal, normalizedConfig),
    temporalMultiplier: getTemporalUncertaintyMultiplier(proposal, normalizedConfig),
    adjustedPriority: calculateAdjustedPriority(proposal, normalizedConfig),
  };
}
