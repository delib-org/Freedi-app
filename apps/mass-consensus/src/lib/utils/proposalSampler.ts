/**
 * Proposal Sampler Class
 *
 * Implements adaptive sampling for proposal selection using Thompson Sampling.
 * Handles batch selection, stability checking, and priority scoring.
 */

import { Statement } from '@freedi/shared-types';
import {
  SamplingConfig,
  DEFAULT_SAMPLING_CONFIG,
  calculateAdjustedPriority,
  isStable,
  getProposalStats,
} from './sampling';
import { logger } from './logger';

/**
 * A proposal with its calculated priority score
 */
export interface ScoredProposal {
  proposal: Statement;
  priority: number;
  stats: {
    mean: number;
    sem: number;
    evaluationCount: number;
  };
  isStable: boolean;
}

/**
 * Statistics about the batch selection process
 */
export interface BatchStats {
  /** Total number of proposals for the question */
  totalCount: number;
  /** Number of proposals the user has already evaluated */
  evaluatedCount: number;
  /** Number of proposals that have reached stability */
  stableCount: number;
  /** Number of proposals remaining after this batch */
  remainingCount: number;
}

/**
 * Result from batch selection
 */
export interface BatchResult {
  /** Selected proposals for the user to evaluate */
  solutions: Statement[];
  /** Whether there are more proposals available */
  hasMore: boolean;
  /** Statistics about the selection */
  stats: BatchStats;
}

/**
 * ProposalSampler - Handles adaptive batch selection
 *
 * Uses Thompson Sampling with multi-factor priority scoring to select
 * which proposals users should evaluate next.
 */
export class ProposalSampler {
  private config: SamplingConfig;

  constructor(config: Partial<SamplingConfig> = {}) {
    this.config = { ...DEFAULT_SAMPLING_CONFIG, ...config };
  }

  /**
   * Calculate percentile ranks for all proposals based on their mean scores.
   * Returns a map of statementId -> percentile (0-1, where 1 = highest mean).
   *
   * Only proposals with at least one evaluation are included in ranking.
   * Proposals without evaluations will not be in the returned map.
   *
   * @param proposals - Array of proposals to rank
   * @returns Map of statementId to percentile rank
   */
  private calculatePercentileRanks(proposals: Statement[]): Map<string, number> {
    // Get means for all proposals with evaluations
    const proposalsWithMeans = proposals
      .filter(p => (p.evaluation?.numberOfEvaluators || 0) > 0)
      .map(p => ({
        id: p.statementId,
        mean: getProposalStats(p).mean,
      }));

    // Handle edge case: no proposals with evaluations
    if (proposalsWithMeans.length === 0) {
      return new Map();
    }

    // Sort by mean ascending (lowest = 0, highest = 1)
    const sorted = [...proposalsWithMeans].sort((a, b) => a.mean - b.mean);

    // Assign percentile ranks
    const percentileMap = new Map<string, number>();
    sorted.forEach((item, index) => {
      const percentile = sorted.length > 1
        ? index / (sorted.length - 1)
        : 0.5; // Single proposal gets middle rank
      percentileMap.set(item.id, percentile);
    });

    return percentileMap;
  }

  /**
   * Score all proposals by priority
   *
   * @param proposals - Array of proposals to score
   * @returns Sorted array of scored proposals (highest priority first)
   */
  scoreProposals(proposals: Statement[]): ScoredProposal[] {
    // Calculate percentile ranks for top-mean bonus
    const percentileRanks = this.calculatePercentileRanks(proposals);

    const scored = proposals.map((proposal) => {
      const stats = getProposalStats(proposal);
      const percentileRank = percentileRanks.get(proposal.statementId);
      const priority = calculateAdjustedPriority(proposal, this.config, percentileRank);
      const stable = isStable(proposal, this.config);

      return {
        proposal,
        priority,
        stats: {
          mean: stats.mean,
          sem: stats.sem,
          evaluationCount: stats.evaluationCount,
        },
        isStable: stable,
      };
    });

    // Sort by priority (highest first)
    scored.sort((a, b) => b.priority - a.priority);

    // Log detailed priority scores for debugging Thompson Sampling
    logger.info('[ProposalSampler] Thompson Sampling priority scores:');
    scored.forEach((s, index) => {
      logger.info(`  #${index + 1}: "${s.proposal.statement?.substring(0, 40)}..." ` +
        `priority=${s.priority.toFixed(4)}, ` +
        `evals=${s.stats.evaluationCount}, ` +
        `mean=${s.stats.mean.toFixed(3)}, ` +
        `sem=${s.stats.sem.toFixed(3)}, ` +
        `stable=${s.isStable}`);
    });

    return scored;
  }

  /**
   * Select a batch of proposals for a user to evaluate
   *
   * @param proposals - All available proposals (not hidden)
   * @param evaluatedIds - Set of proposal IDs the user has already evaluated
   * @param count - Number of proposals to select
   * @returns Selected proposals sorted by priority
   */
  selectForUser(
    proposals: Statement[],
    evaluatedIds: Set<string>,
    count: number
  ): Statement[] {
    // Filter out already-evaluated and stable proposals
    const available = proposals.filter((p) => {
      // Skip if user already evaluated
      if (evaluatedIds.has(p.statementId)) {
        return false;
      }

      // Skip if marked as stable (early stopping)
      // Note: Using optional field that may not exist yet
      if ((p as Statement & { isStable?: boolean }).isStable) {
        return false;
      }

      // Also check computed stability
      if (isStable(p, this.config)) {
        return false;
      }

      return true;
    });

    logger.info('[ProposalSampler] Filtering proposals:', {
      total: proposals.length,
      evaluated: evaluatedIds.size,
      available: available.length,
      requested: count,
    });

    if (available.length === 0) {
      logger.info('[ProposalSampler] No available proposals');
      return [];
    }

    // Score and sort available proposals
    const scored = this.scoreProposals(available);

    // Select top N by priority
    const selected = scored.slice(0, count).map((s) => s.proposal);

    logger.info('[ProposalSampler] Selected proposals:', {
      selectedCount: selected.length,
      topPriority: scored[0]?.priority.toFixed(3),
      bottomPriority: scored[Math.min(count - 1, scored.length - 1)]?.priority.toFixed(3),
    });

    return selected;
  }

  /**
   * Check if a proposal should be marked as stable
   *
   * @param proposal - The proposal to check
   * @returns Whether the proposal is stable
   */
  checkStability(proposal: Statement): boolean {
    return isStable(proposal, this.config);
  }

  /**
   * Calculate batch statistics
   *
   * @param allProposals - All proposals for the question
   * @param evaluatedIds - Set of proposal IDs the user has already evaluated
   * @param selectedCount - Number of proposals in this batch
   */
  calculateStats(
    allProposals: Statement[],
    evaluatedIds: Set<string>,
    selectedCount: number
  ): BatchStats {
    const stableCount = allProposals.filter((p) => {
      // Check explicit isStable flag
      if ((p as Statement & { isStable?: boolean }).isStable) {
        return true;
      }
      // Check computed stability
      return isStable(p, this.config);
    }).length;

    const availableCount = allProposals.filter((p) => {
      if (evaluatedIds.has(p.statementId)) return false;
      if ((p as Statement & { isStable?: boolean }).isStable) return false;
      if (isStable(p, this.config)) return false;
      return true;
    }).length;

    return {
      totalCount: allProposals.length,
      evaluatedCount: evaluatedIds.size,
      stableCount,
      remainingCount: Math.max(0, availableCount - selectedCount),
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): SamplingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SamplingConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a default sampler instance
 */
export function createSampler(config?: Partial<SamplingConfig>): ProposalSampler {
  return new ProposalSampler(config);
}
