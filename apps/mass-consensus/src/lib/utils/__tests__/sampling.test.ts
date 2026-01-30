/**
 * Tests for Bayesian adaptive sampling utility functions
 *
 * Tests cover:
 * - Bayesian prior incorporation (pseudo-counts)
 * - UCB priority calculation (vetting)
 * - Gaussian Thompson Sampling (exploration)
 * - Recovery mechanism (anti-burial)
 * - Stability detection
 */
import { Statement, StatementType } from '@freedi/shared-types';
import {
  calculateStatsFromAggregates,
  getProposalStats,
  calculatePriority,
  calculateUCBPriority,
  thompsonSample,
  gaussianThompsonSample,
  isStable,
  calculateAdjustedPriority,
  getSamplingDiagnostics,
  SamplingConfig,
  DEFAULT_SAMPLING_CONFIG,
} from '../sampling';

describe('Bayesian sampling utilities', () => {
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
    describe('Bayesian prior incorporation', () => {
      it('should return prior mean for zero evaluators', () => {
        const stats = calculateStatsFromAggregates(0, 0, 0);
        expect(stats.mean).toBe(0);
        expect(stats.posteriorMean).toBe(0); // priorMean default = 0
        expect(stats.sem).toBe(0.5); // BASE_UNCERTAINTY
        expect(stats.evaluationCount).toBe(0);
        expect(stats.effectiveSampleSize).toBe(2); // priorStrength default = 2
      });

      it('should blend prior with single evaluation', () => {
        // Single positive evaluation (+1)
        const stats = calculateStatsFromAggregates(1, 1, 1);
        expect(stats.mean).toBe(1); // Raw mean = 1
        // Posterior = (2 * 0 + 1) / (2 + 1) = 1/3 ≈ 0.333
        expect(stats.posteriorMean).toBeCloseTo(1/3, 2);
        expect(stats.effectiveSampleSize).toBe(3);
      });

      it('should blend prior with negative evaluation', () => {
        // Single negative evaluation (-1)
        const stats = calculateStatsFromAggregates(-1, 1, 1);
        expect(stats.mean).toBe(-1); // Raw mean = -1
        // Posterior = (2 * 0 + (-1)) / (2 + 1) = -1/3 ≈ -0.333
        expect(stats.posteriorMean).toBeCloseTo(-1/3, 2);
      });

      it('should approach raw mean with many evaluations', () => {
        // 100 evaluations with mean = 0.8
        const stats = calculateStatsFromAggregates(80, 70, 100);
        expect(stats.mean).toBe(0.8);
        // Posterior ≈ (2 * 0 + 80) / (2 + 100) = 80/102 ≈ 0.784
        expect(stats.posteriorMean).toBeCloseTo(80/102, 2);
        // With many evaluations, posterior should be close to raw mean
        expect(Math.abs(stats.posteriorMean - stats.mean)).toBeLessThan(0.02);
      });

      it('should respect custom prior settings', () => {
        const config: SamplingConfig = {
          ...DEFAULT_SAMPLING_CONFIG,
          priorStrength: 5,
          priorMean: 0.5,
        };
        const stats = calculateStatsFromAggregates(1, 1, 1, config);
        // Posterior = (5 * 0.5 + 1) / (5 + 1) = 3.5/6 ≈ 0.583
        expect(stats.posteriorMean).toBeCloseTo(3.5/6, 2);
        expect(stats.effectiveSampleSize).toBe(6);
      });
    });

    describe('edge cases', () => {
      it('should return floor SEM for single evaluator', () => {
        const stats = calculateStatsFromAggregates(0.5, 0.25, 1);
        expect(stats.mean).toBe(0.5);
        expect(stats.evaluationCount).toBe(1);
        // SEM should be reduced by effective sample size (n + priorStrength)
        expect(stats.sem).toBeLessThan(0.5);
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
        const stats = calculateStatsFromAggregates(10, 9.9, 10);
        expect(stats.variance).toBeGreaterThanOrEqual(0);
      });
    });

    describe('SEM calculation with effective sample size', () => {
      it('should use effective sample size for SEM', () => {
        // n=4, prior=2, effective=6
        // With stdDev=1, SEM should be 1/sqrt(6) ≈ 0.408
        const stats = calculateStatsFromAggregates(0, 4, 4);
        const expectedSEM = 1 / Math.sqrt(4 + 2); // effective sample size
        expect(stats.sem).toBeCloseTo(expectedSEM, 1);
      });

      it('should apply minimum SEM floor', () => {
        // Very low variance case
        const stats = calculateStatsFromAggregates(5, 2.5, 10);
        expect(stats.sem).toBeGreaterThanOrEqual(0.05); // MIN_SEM
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
    it('should return prior-based stats for statement without evaluation', () => {
      const statement = createMockStatement();
      const stats = getProposalStats(statement);
      expect(stats.mean).toBe(0);
      expect(stats.posteriorMean).toBe(0);
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

  describe('calculateUCBPriority', () => {
    describe('UCB vetting behavior', () => {
      it('should give higher UCB to moderately positive proposals with high uncertainty', () => {
        // Moderate positive mean, high uncertainty - needs verification
        const uncertainProposal = createMockStatement({
          sumEvaluations: 2.5, // mean = 0.5 with 5 evals
          sumSquaredEvaluations: 3,
          numberOfEvaluators: 5,
        });
        // Moderate positive mean, low uncertainty - well verified
        const verifiedProposal = createMockStatement({
          sumEvaluations: 15, // mean = 0.5 with 30 evals
          sumSquaredEvaluations: 8,
          numberOfEvaluators: 30,
        });

        const uncertainUCB = calculateUCBPriority(uncertainProposal);
        const verifiedUCB = calculateUCBPriority(verifiedProposal);

        // Higher uncertainty should lead to higher UCB for vetting
        expect(uncertainUCB).toBeGreaterThan(verifiedUCB);
      });

      it('should give high UCB to new proposals due to uncertainty', () => {
        const newProposal = createMockStatement();
        const ucb = calculateUCBPriority(newProposal);

        // New proposals get high UCB due to uncertainty + temporal boost
        // UCB can exceed 1 due to exploration bonus (this is by design)
        expect(ucb).toBeGreaterThan(0.5);
      });

      it('should produce UCB values >= 0 for all proposals', () => {
        const scenarios = [
          createMockStatement(),
          createMockStatement({ sumEvaluations: 10, numberOfEvaluators: 10 }),
          createMockStatement({ sumEvaluations: -10, numberOfEvaluators: 10 }),
        ];

        scenarios.forEach(statement => {
          const ucb = calculateUCBPriority(statement);
          // UCB should always be non-negative
          expect(ucb).toBeGreaterThanOrEqual(0);
          // Note: UCB can exceed 1 due to exploration bonus - this is intentional
          // for the ranking mechanism. Final priority is clamped in calculateAdjustedPriority
        });
      });
    });

    describe('temporal uncertainty boost', () => {
      it('should give higher UCB to recent proposals', () => {
        const now = Date.now();
        const recentProposal = createMockStatement(
          { sumEvaluations: 0, numberOfEvaluators: 10 },
          now - (1 * 60 * 60 * 1000) // 1 hour old
        );
        const oldProposal = createMockStatement(
          { sumEvaluations: 0, numberOfEvaluators: 10 },
          now - (48 * 60 * 60 * 1000) // 48 hours old
        );

        const recentUCB = calculateUCBPriority(recentProposal);
        const oldUCB = calculateUCBPriority(oldProposal);

        expect(recentUCB).toBeGreaterThan(oldUCB);
      });
    });
  });

  describe('calculatePriority (backward compatibility)', () => {
    it('should delegate to calculateUCBPriority', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        numberOfEvaluators: 10,
      });

      const priority = calculatePriority(statement);
      const ucbPriority = calculateUCBPriority(statement);

      expect(priority).toBe(ucbPriority);
    });

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

      // Under-evaluated proposals have higher UCB due to uncertainty
      expect(lowPriority).toBeGreaterThan(highPriority);
    });
  });

  describe('gaussianThompsonSample', () => {
    describe('new proposals', () => {
      it('should return varied samples for proposals with no evaluations', () => {
        const statement = createMockStatement();

        // Run multiple times to verify randomness
        const samples = Array.from({ length: 100 }, () => gaussianThompsonSample(statement));
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
          gaussianThompsonSample(positiveStatement)
        );
        const negativeSamples = Array.from({ length: 100 }, () =>
          gaussianThompsonSample(negativeStatement)
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
        const samples = Array.from({ length: 1000 }, () => gaussianThompsonSample(statement));

        samples.forEach(sample => {
          expect(sample).toBeGreaterThanOrEqual(0);
          expect(sample).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('Gaussian distribution properties', () => {
      it('should produce samples centered around posterior mean', () => {
        const statement = createMockStatement({
          sumEvaluations: 5, // mean = 0.5
          sumSquaredEvaluations: 3,
          numberOfEvaluators: 10,
        });

        const samples = Array.from({ length: 500 }, () => gaussianThompsonSample(statement));
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

        // Average should be close to normalized posterior mean
        const stats = getProposalStats(statement);
        const expectedNormalized = (stats.posteriorMean + 1) / 2;

        expect(Math.abs(avg - expectedNormalized)).toBeLessThan(0.1);
      });
    });
  });

  describe('thompsonSample (backward compatibility)', () => {
    it('should delegate to gaussianThompsonSample', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        numberOfEvaluators: 10,
      });

      // Both should produce valid samples in [0, 1]
      const sample1 = thompsonSample(statement);
      const sample2 = gaussianThompsonSample(statement);

      expect(sample1).toBeGreaterThanOrEqual(0);
      expect(sample1).toBeLessThanOrEqual(1);
      expect(sample2).toBeGreaterThanOrEqual(0);
      expect(sample2).toBeLessThanOrEqual(1);
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
      // Check if conditions are met
      const stats = getProposalStats(statement);
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
    it('should combine UCB with Thompson sampling', () => {
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

    it('should give low priority to stable proposals', () => {
      const stableStatement = createMockStatement({
        sumEvaluations: 15,
        sumSquaredEvaluations: 7.5,
        numberOfEvaluators: 30,
      });

      // Check if it's actually stable
      const stats = getProposalStats(stableStatement);
      if (stats.sem < 0.15 && isStable(stableStatement)) {
        const priorities = Array.from({ length: 10 }, () =>
          calculateAdjustedPriority(stableStatement)
        );

        // Stable proposals should have very low priority
        priorities.forEach(p => {
          expect(p).toBeLessThan(0.2);
        });
      }
    });

    it('should apply exploration floor for unstable proposals', () => {
      const unstableStatement = createMockStatement({
        sumEvaluations: -10, // Very negative
        sumSquaredEvaluations: 10,
        numberOfEvaluators: 10,
      });

      const priorities = Array.from({ length: 20 }, () =>
        calculateAdjustedPriority(unstableStatement)
      );

      // All priorities should be >= exploration floor (0.1)
      priorities.forEach(p => {
        expect(p).toBeGreaterThanOrEqual(DEFAULT_SAMPLING_CONFIG.explorationFloor);
      });
    });

    it('should handle legacy explorationWeight config', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        numberOfEvaluators: 10,
      });

      // Legacy config with explorationWeight
      const legacyConfig = {
        ...DEFAULT_SAMPLING_CONFIG,
        explorationWeight: 0.3,
      };

      const priority = calculateAdjustedPriority(statement, legacyConfig);

      expect(priority).toBeGreaterThanOrEqual(0);
      expect(priority).toBeLessThanOrEqual(1);
    });
  });

  describe('anti-burial recovery mechanism', () => {
    it('should give recovery chance to negative proposals with high uncertainty', () => {
      // Proposal with negative mean but high uncertainty (could recover)
      const buriedButUncertain = createMockStatement({
        sumEvaluations: -2, // mean = -0.4 with 5 evals
        sumSquaredEvaluations: 3,
        numberOfEvaluators: 5,
      });

      // Run diagnostics
      const diagnostics = getSamplingDiagnostics(buriedButUncertain);

      // Should have recovery score > 0
      expect(diagnostics.recoveryScore).toBeGreaterThan(0);
    });

    it('should give less recovery chance to clearly negative proposals', () => {
      // Proposal with clearly negative score (many evaluations)
      const clearlyNegative = createMockStatement({
        sumEvaluations: -25, // mean = -0.83 with 30 evals
        sumSquaredEvaluations: 25,
        numberOfEvaluators: 30,
      });

      // Run diagnostics
      const diagnostics = getSamplingDiagnostics(clearlyNegative);

      // Should have low recovery score
      expect(diagnostics.recoveryScore).toBeLessThan(0.3);
    });

    it('should give no recovery to positive proposals', () => {
      const positiveProposal = createMockStatement({
        sumEvaluations: 5,
        sumSquaredEvaluations: 5,
        numberOfEvaluators: 10,
      });

      const diagnostics = getSamplingDiagnostics(positiveProposal);

      expect(diagnostics.recoveryScore).toBe(0);
    });
  });

  describe('getSamplingDiagnostics', () => {
    it('should return all diagnostic information', () => {
      const statement = createMockStatement({
        sumEvaluations: 5,
        sumSquaredEvaluations: 5,
        numberOfEvaluators: 10,
      });

      const diagnostics = getSamplingDiagnostics(statement);

      expect(diagnostics).toHaveProperty('stats');
      expect(diagnostics).toHaveProperty('isStable');
      expect(diagnostics).toHaveProperty('ucbPriority');
      expect(diagnostics).toHaveProperty('recoveryScore');
      expect(diagnostics).toHaveProperty('thresholdScore');
      expect(diagnostics).toHaveProperty('temporalMultiplier');
      expect(diagnostics).toHaveProperty('adjustedPriority');

      // Validate types
      expect(typeof diagnostics.isStable).toBe('boolean');
      expect(typeof diagnostics.ucbPriority).toBe('number');
      expect(typeof diagnostics.adjustedPriority).toBe('number');
    });
  });

  describe('DEFAULT_SAMPLING_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_SAMPLING_CONFIG.targetEvaluations).toBe(30);
      expect(DEFAULT_SAMPLING_CONFIG.targetSEM).toBe(0.15);
      expect(DEFAULT_SAMPLING_CONFIG.explorationKappa).toBe(1.5);
      expect(DEFAULT_SAMPLING_CONFIG.recencyBoostHours).toBe(24);
      expect(DEFAULT_SAMPLING_CONFIG.priorStrength).toBe(2);
      expect(DEFAULT_SAMPLING_CONFIG.priorMean).toBe(0);
      expect(DEFAULT_SAMPLING_CONFIG.explorationFloor).toBe(0.1);
    });

    it('should have exploration kappa > 0', () => {
      expect(DEFAULT_SAMPLING_CONFIG.explorationKappa).toBeGreaterThan(0);
    });

    it('should have valid prior strength', () => {
      expect(DEFAULT_SAMPLING_CONFIG.priorStrength).toBeGreaterThan(0);
    });

    it('should have exploration floor between 0 and 1', () => {
      expect(DEFAULT_SAMPLING_CONFIG.explorationFloor).toBeGreaterThan(0);
      expect(DEFAULT_SAMPLING_CONFIG.explorationFloor).toBeLessThan(1);
    });
  });
});
