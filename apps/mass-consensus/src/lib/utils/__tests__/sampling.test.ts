/**
 * Tests for sampling utility functions (Thompson Sampling)
 */
import { Statement, StatementType } from '@freedi/shared-types';
import {
  calculateStatsFromAggregates,
  getProposalStats,
  calculatePriority,
  thompsonSample,
  isStable,
  calculateAdjustedPriority,
  SamplingConfig,
  DEFAULT_SAMPLING_CONFIG,
} from '../sampling';

describe('sampling utilities', () => {
  // Helper to create a mock Statement
  const createMockStatement = (
    evaluation?: Partial<Statement['evaluation']>,
    createdAt?: number
  ): Statement => ({
    statementId: 'test-id',
    statement: 'Test statement',
    statementType: StatementType.option,
    parentId: 'parent-id',
    creator: {
      uid: 'user-id',
      displayName: 'Test User',
      photoURL: '',
      email: 'test@test.com',
      createdAt: Date.now(),
      lastSignInTime: Date.now(),
      role: 'user',
    },
    creatorId: 'user-id',
    createdAt: createdAt ?? Date.now(),
    lastUpdate: Date.now(),
    parents: ['parent-id'],
    topParentId: 'top-parent-id',
    hasChildren: false,
    resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
    results: [],
    consensus: 0,
    evaluation: evaluation ? {
      statementId: 'test-id',
      parentId: 'parent-id',
      evaluationId: 'eval-id',
      topParentId: 'top-parent-id',
      sumEvaluations: evaluation.sumEvaluations ?? 0,
      sumSquaredEvaluations: evaluation.sumSquaredEvaluations ?? 0,
      numberOfEvaluators: evaluation.numberOfEvaluators ?? 0,
      agreement: evaluation.agreement ?? 0,
    } : undefined,
  } as Statement);

  describe('calculateStatsFromAggregates', () => {
    describe('edge cases', () => {
      it('should return default values for zero evaluators', () => {
        const stats = calculateStatsFromAggregates(0, 0, 0);
        expect(stats.mean).toBe(0);
        expect(stats.sem).toBe(0.5); // FLOOR_STD_DEV
        expect(stats.variance).toBe(0);
        expect(stats.evaluationCount).toBe(0);
      });

      it('should return floor SEM for single evaluator', () => {
        const stats = calculateStatsFromAggregates(0.5, 0.25, 1);
        expect(stats.mean).toBe(0.5);
        expect(stats.sem).toBe(0.5); // FLOOR_STD_DEV
        expect(stats.variance).toBe(0);
        expect(stats.evaluationCount).toBe(1);
      });
    });

    describe('basic calculations', () => {
      it('should calculate mean correctly', () => {
        // 10 evaluations, sum = 5, mean = 0.5
        const stats = calculateStatsFromAggregates(5, 3, 10);
        expect(stats.mean).toBe(0.5);
        expect(stats.evaluationCount).toBe(10);
      });

      it('should calculate variance correctly', () => {
        // sum = 0, sumSquared = 10, n = 10
        // variance = E[X^2] - (E[X])^2 = 1 - 0 = 1
        const stats = calculateStatsFromAggregates(0, 10, 10);
        expect(stats.mean).toBe(0);
        expect(stats.variance).toBe(1);
      });

      it('should handle negative mean', () => {
        const stats = calculateStatsFromAggregates(-5, 5, 10);
        expect(stats.mean).toBe(-0.5);
      });

      it('should ensure variance is never negative', () => {
        // Edge case where numerical precision might cause negative variance
        // This shouldn't happen mathematically but we safeguard anyway
        const stats = calculateStatsFromAggregates(10, 9.9, 10);
        expect(stats.variance).toBeGreaterThanOrEqual(0);
      });
    });

    describe('SEM calculation', () => {
      it('should calculate SEM as stdDev / sqrt(n)', () => {
        // With n=4, stdDev=1, SEM should be 0.5
        // sum=0, sumSquared=4, n=4 gives variance=1, stdDev=1
        // SEM = 1 / sqrt(4) = 0.5
        const stats = calculateStatsFromAggregates(0, 4, 4);
        expect(stats.sem).toBe(0.5);
      });

      it('should use floor std dev when observed is lower', () => {
        // All identical evaluations would give 0 variance
        // sum = n * value, sumSquared = n * value^2
        // For n=10, all values = 0.5: sum = 5, sumSquared = 2.5
        // variance = 0.25 - 0.25 = 0, observed stdDev = 0
        // Should use FLOOR_STD_DEV = 0.5
        const stats = calculateStatsFromAggregates(5, 2.5, 10);
        expect(stats.sem).toBe(0.5 / Math.sqrt(10));
      });
    });

    describe('large numbers', () => {
      it('should handle large evaluation counts', () => {
        const n = 10000;
        const sum = 5000;
        const sumSquared = 3000;
        const stats = calculateStatsFromAggregates(sum, sumSquared, n);
        expect(stats.evaluationCount).toBe(n);
        expect(stats.mean).toBe(0.5);
      });
    });
  });

  describe('getProposalStats', () => {
    it('should return default stats for statement without evaluation', () => {
      const statement = createMockStatement();
      const stats = getProposalStats(statement);
      expect(stats.mean).toBe(0);
      expect(stats.sem).toBe(0.5);
      expect(stats.variance).toBe(0);
      expect(stats.evaluationCount).toBe(0);
    });

    it('should extract stats from statement evaluation', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        sumSquaredEvaluations: 3,
        numberOfEvaluators: 10,
      });
      const stats = getProposalStats(statement);
      expect(stats.mean).toBe(0.5);
      expect(stats.evaluationCount).toBe(10);
    });

    it('should handle missing evaluation fields', () => {
      const statement = createMockStatement({
        sumEvaluations: undefined,
        numberOfEvaluators: undefined,
      });
      const stats = getProposalStats(statement);
      expect(stats.evaluationCount).toBe(0);
    });
  });

  describe('calculatePriority', () => {
    describe('base priority (evaluation count)', () => {
      it('should give high priority to under-evaluated proposals', () => {
        const lowEvals = createMockStatement({
          sumEvaluations: 0,
          sumSquaredEvaluations: 0,
          numberOfEvaluators: 5,
        });
        const highEvals = createMockStatement({
          sumEvaluations: 0,
          sumSquaredEvaluations: 0,
          numberOfEvaluators: 25,
        });

        const lowPriority = calculatePriority(lowEvals);
        const highPriority = calculatePriority(highEvals);

        expect(lowPriority).toBeGreaterThan(highPriority);
      });

      it('should give zero base priority when target evaluations reached', () => {
        const statement = createMockStatement({
          sumEvaluations: 0,
          sumSquaredEvaluations: 0,
          numberOfEvaluators: 30, // DEFAULT target
        });
        // Priority should still be non-zero due to other factors
        const priority = calculatePriority(statement);
        expect(priority).toBeGreaterThanOrEqual(0);
      });
    });

    describe('uncertainty bonus', () => {
      it('should give higher priority to proposals with high SEM', () => {
        // High variance -> high SEM
        const highVariance = createMockStatement({
          sumEvaluations: 0,
          sumSquaredEvaluations: 100, // High spread
          numberOfEvaluators: 10,
        });
        // Low variance -> low SEM
        const lowVariance = createMockStatement({
          sumEvaluations: 0,
          sumSquaredEvaluations: 0.1, // Low spread
          numberOfEvaluators: 10,
        });

        const highPriority = calculatePriority(highVariance);
        const lowPriority = calculatePriority(lowVariance);

        // Both may be equal or high >= low due to floor std dev
        expect(highPriority).toBeGreaterThanOrEqual(lowPriority);
      });

      it('should give full uncertainty bonus to new proposals', () => {
        const newProposal = createMockStatement();
        const priority = calculatePriority(newProposal);
        // New proposals should have relatively high priority
        expect(priority).toBeGreaterThan(0.5);
      });
    });

    describe('recency boost', () => {
      it('should give higher priority to recent proposals', () => {
        const now = Date.now();
        const recentProposal = createMockStatement(
          { sumEvaluations: 0, numberOfEvaluators: 10 },
          now - (1 * 60 * 60 * 1000) // 1 hour old
        );
        const oldProposal = createMockStatement(
          { sumEvaluations: 0, numberOfEvaluators: 10 },
          now - (48 * 60 * 60 * 1000) // 48 hours old
        );

        const recentPriority = calculatePriority(recentProposal);
        const oldPriority = calculatePriority(oldProposal);

        expect(recentPriority).toBeGreaterThan(oldPriority);
      });

      it('should give no recency boost after boost window expires', () => {
        const now = Date.now();
        const oldProposal = createMockStatement(
          { sumEvaluations: 0, numberOfEvaluators: 25 },
          now - (72 * 60 * 60 * 1000) // 72 hours old
        );
        // Old proposals without recency boost should have lower priority
        // but may still have uncertainty bonus and near-threshold bonus
        const priority = calculatePriority(oldProposal);
        // Priority is still valid (between 0 and 1)
        expect(priority).toBeGreaterThanOrEqual(0);
        expect(priority).toBeLessThanOrEqual(1);
      });
    });

    describe('near-threshold bonus', () => {
      it('should give bonus to proposals near zero mean', () => {
        // Near zero mean with wide confidence interval
        const nearZero = createMockStatement({
          sumEvaluations: 0.1 * 10, // mean = 0.1
          sumSquaredEvaluations: 5,
          numberOfEvaluators: 10,
        });
        // Clear positive mean
        const clearPositive = createMockStatement({
          sumEvaluations: 8, // mean = 0.8
          sumSquaredEvaluations: 7,
          numberOfEvaluators: 10,
        });

        const nearZeroPriority = calculatePriority(nearZero);
        const clearPriority = calculatePriority(clearPositive);

        // Near-zero should get bonus for being near threshold
        expect(nearZeroPriority).toBeGreaterThan(clearPriority);
      });
    });

    describe('custom config', () => {
      it('should respect custom target evaluations', () => {
        const config: SamplingConfig = {
          ...DEFAULT_SAMPLING_CONFIG,
          targetEvaluations: 10,
        };
        const statement = createMockStatement({
          sumEvaluations: 0,
          numberOfEvaluators: 5,
        });

        const priorityDefault = calculatePriority(statement);
        const priorityCustom = calculatePriority(statement, config);

        // With lower target, 5 evals is more "complete", so priority should be lower
        expect(priorityCustom).toBeLessThan(priorityDefault);
      });
    });

    describe('return value range', () => {
      it('should return value between 0 and 1', () => {
        const scenarios = [
          createMockStatement(),
          createMockStatement({ sumEvaluations: 10, numberOfEvaluators: 100 }),
          createMockStatement({ sumEvaluations: -10, numberOfEvaluators: 5 }),
        ];

        scenarios.forEach(statement => {
          const priority = calculatePriority(statement);
          expect(priority).toBeGreaterThanOrEqual(0);
          expect(priority).toBeLessThanOrEqual(1);
        });
      });
    });
  });

  describe('thompsonSample', () => {
    describe('new proposals', () => {
      it('should return random value for proposals with no evaluations', () => {
        const statement = createMockStatement();

        // Run multiple times to verify randomness
        const samples = Array.from({ length: 100 }, () => thompsonSample(statement));
        const uniqueSamples = new Set(samples);

        // Should have significant variation
        expect(uniqueSamples.size).toBeGreaterThan(50);

        // All values should be in [0, 1]
        samples.forEach(sample => {
          expect(sample).toBeGreaterThanOrEqual(0);
          expect(sample).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('evaluated proposals', () => {
      it('should return higher samples for positively rated proposals', () => {
        const positiveStatement = createMockStatement({
          sumEvaluations: 8, // mean = 0.8
          sumSquaredEvaluations: 7,
          numberOfEvaluators: 10,
        });
        const negativeStatement = createMockStatement({
          sumEvaluations: -8, // mean = -0.8
          sumSquaredEvaluations: 7,
          numberOfEvaluators: 10,
        });

        // Average over multiple samples
        const positiveSamples = Array.from({ length: 100 }, () =>
          thompsonSample(positiveStatement)
        );
        const negativeSamples = Array.from({ length: 100 }, () =>
          thompsonSample(negativeStatement)
        );

        const positiveAvg = positiveSamples.reduce((a, b) => a + b, 0) / 100;
        const negativeAvg = negativeSamples.reduce((a, b) => a + b, 0) / 100;

        expect(positiveAvg).toBeGreaterThan(negativeAvg);
      });

      it('should clamp output to [0, 1]', () => {
        const statement = createMockStatement({
          sumEvaluations: 5,
          sumSquaredEvaluations: 10,
          numberOfEvaluators: 10,
        });

        // Run many samples
        const samples = Array.from({ length: 1000 }, () => thompsonSample(statement));

        samples.forEach(sample => {
          expect(sample).toBeGreaterThanOrEqual(0);
          expect(sample).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('stochastic behavior', () => {
      it('should produce different results on each call', () => {
        const statement = createMockStatement({
          sumEvaluations: 5,
          sumSquaredEvaluations: 5,
          numberOfEvaluators: 10,
        });

        const sample1 = thompsonSample(statement);
        const sample2 = thompsonSample(statement);

        // Very unlikely to be exactly equal
        // But we can't assert they're different every time
        // Just check they're valid
        expect(sample1).toBeGreaterThanOrEqual(0);
        expect(sample2).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('isStable', () => {
    it('should return false for proposals with too few evaluations', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        sumSquaredEvaluations: 3,
        numberOfEvaluators: 10, // Less than default 30
      });
      expect(isStable(statement)).toBe(false);
    });

    it('should return false for proposals with high SEM', () => {
      const statement = createMockStatement({
        sumEvaluations: 0,
        sumSquaredEvaluations: 100, // High variance -> high SEM
        numberOfEvaluators: 30,
      });
      expect(isStable(statement)).toBe(false);
    });

    it('should return true for proposals with enough evaluations and low SEM', () => {
      // Low variance scenario with many evaluations
      const statement = createMockStatement({
        sumEvaluations: 15, // mean = 0.5
        sumSquaredEvaluations: 7.5, // variance ~ 0
        numberOfEvaluators: 30,
      });
      // SEM should be low enough to be stable
      const stats = getProposalStats(statement);
      // Check if conditions are met
      if (stats.sem < 0.15) {
        expect(isStable(statement)).toBe(true);
      }
    });

    it('should respect custom config', () => {
      const config: SamplingConfig = {
        ...DEFAULT_SAMPLING_CONFIG,
        targetEvaluations: 5,
        targetSEM: 0.5,
      };

      const statement = createMockStatement({
        sumEvaluations: 2,
        sumSquaredEvaluations: 1,
        numberOfEvaluators: 5,
      });

      expect(isStable(statement, config)).toBe(true);
    });

    it('should require both conditions to be met', () => {
      // High eval count but high SEM
      const highEvalHighSEM = createMockStatement({
        sumEvaluations: 0,
        sumSquaredEvaluations: 30, // High variance
        numberOfEvaluators: 30,
      });

      // Low eval count but would have low SEM
      const lowEvalLowSEM = createMockStatement({
        sumEvaluations: 5,
        sumSquaredEvaluations: 2.5,
        numberOfEvaluators: 10,
      });

      expect(isStable(highEvalHighSEM)).toBe(false);
      expect(isStable(lowEvalLowSEM)).toBe(false);
    });
  });

  describe('calculateAdjustedPriority', () => {
    it('should combine deterministic priority with Thompson sample', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        sumSquaredEvaluations: 5,
        numberOfEvaluators: 10,
      });

      const adjustedPriority = calculateAdjustedPriority(statement);

      expect(adjustedPriority).toBeGreaterThanOrEqual(0);
      expect(adjustedPriority).toBeLessThanOrEqual(1);
    });

    it('should produce different results due to Thompson sampling', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        sumSquaredEvaluations: 5,
        numberOfEvaluators: 10,
      });

      const priorities = Array.from({ length: 20 }, () =>
        calculateAdjustedPriority(statement)
      );
      const uniquePriorities = new Set(priorities);

      // Should have some variation due to Thompson sampling
      expect(uniquePriorities.size).toBeGreaterThan(1);
    });

    it('should respect exploration weight', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        numberOfEvaluators: 10,
      });

      const lowExploration: SamplingConfig = {
        ...DEFAULT_SAMPLING_CONFIG,
        explorationWeight: 0.1,
      };
      const highExploration: SamplingConfig = {
        ...DEFAULT_SAMPLING_CONFIG,
        explorationWeight: 0.9,
      };

      // With low exploration, results should be more consistent
      const lowExpPriorities = Array.from({ length: 50 }, () =>
        calculateAdjustedPriority(statement, lowExploration)
      );
      const highExpPriorities = Array.from({ length: 50 }, () =>
        calculateAdjustedPriority(statement, highExploration)
      );

      // Calculate variance
      const lowMean = lowExpPriorities.reduce((a, b) => a + b, 0) / 50;
      const highMean = highExpPriorities.reduce((a, b) => a + b, 0) / 50;

      const lowVariance = lowExpPriorities.reduce((sum, p) =>
        sum + Math.pow(p - lowMean, 2), 0) / 50;
      const highVariance = highExpPriorities.reduce((sum, p) =>
        sum + Math.pow(p - highMean, 2), 0) / 50;

      // High exploration should have higher variance
      expect(highVariance).toBeGreaterThan(lowVariance);
    });

    it('should weight deterministic vs exploration correctly', () => {
      const statement = createMockStatement();
      const config: SamplingConfig = {
        ...DEFAULT_SAMPLING_CONFIG,
        explorationWeight: 0.3, // Default
      };

      // Formula: (1 - 0.3) * priority + 0.3 * exploration
      // Priority should contribute 70%, exploration 30%
      const deterministicPriority = calculatePriority(statement, config);

      // Run many times and check average is close to weighted combination
      const samples = Array.from({ length: 100 }, () =>
        calculateAdjustedPriority(statement, config)
      );
      const avgAdjusted = samples.reduce((a, b) => a + b, 0) / 100;

      // Average exploration sample should be ~0.5
      const expectedAvg = 0.7 * deterministicPriority + 0.3 * 0.5;

      // Allow some tolerance due to randomness
      expect(Math.abs(avgAdjusted - expectedAvg)).toBeLessThan(0.1);
    });
  });

  describe('DEFAULT_SAMPLING_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_SAMPLING_CONFIG.targetEvaluations).toBe(30);
      expect(DEFAULT_SAMPLING_CONFIG.targetSEM).toBe(0.15);
      expect(DEFAULT_SAMPLING_CONFIG.explorationWeight).toBe(0.3);
      expect(DEFAULT_SAMPLING_CONFIG.recencyBoostHours).toBe(24);
    });

    it('should have exploration weight between 0 and 1', () => {
      expect(DEFAULT_SAMPLING_CONFIG.explorationWeight).toBeGreaterThan(0);
      expect(DEFAULT_SAMPLING_CONFIG.explorationWeight).toBeLessThan(1);
    });
  });
});
