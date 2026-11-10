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

import type { Statement } from '../../models/statement/StatementTypes';
import {
  DEFAULT_SAMPLING_CONFIG,
  getProposalStats,
  normalizeConfig,
  type LegacySamplingConfig,
  type ProposalStats,
  type SamplingConfig,
} from './samplingStats';

export {
  calculateStatsFromAggregates,
  DEFAULT_SAMPLING_CONFIG,
  getProposalStats,
} from './samplingStats';
export type { ProposalStats, SamplingConfig } from './samplingStats';

/**
 * Z-score for 95% confidence interval
 */
const Z_95 = 1.96;

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
 * @param percentileRank - Optional percentile rank (0-1) for top-mean bonus calculation
 */
export function calculateAdjustedPriority(
  proposal: Statement,
  config: SamplingConfig | LegacySamplingConfig = DEFAULT_SAMPLING_CONFIG,
  _percentileRank?: number
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
