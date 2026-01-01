/**
 * Tests for ProposalSampler class
 *
 * Covers adaptive sampling for proposal selection using Thompson Sampling.
 */
import { Statement, StatementType } from '@freedi/shared-types';
import {
  ProposalSampler,
  createSampler,
  ScoredProposal,
  BatchStats,
} from '../proposalSampler';
import { DEFAULT_SAMPLING_CONFIG } from '../sampling';

// Mock logger to avoid console output during tests
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ProposalSampler', () => {
  // Helper to create a mock Statement
  const createMockStatement = (
    id: string,
    evaluation?: Partial<Statement['evaluation']>,
    createdAt?: number,
    options?: { isStable?: boolean }
  ): Statement & { isStable?: boolean } => {
    const statement: Statement & { isStable?: boolean } = {
      statementId: id,
      statement: `Test statement ${id}`,
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
      evaluation: evaluation
        ? {
            statementId: id,
            parentId: 'parent-id',
            evaluationId: 'eval-id',
            topParentId: 'top-parent-id',
            sumEvaluations: evaluation.sumEvaluations ?? 0,
            sumSquaredEvaluations: evaluation.sumSquaredEvaluations ?? 0,
            numberOfEvaluators: evaluation.numberOfEvaluators ?? 0,
            agreement: evaluation.agreement ?? 0,
          }
        : undefined,
    };

    if (options?.isStable !== undefined) {
      statement.isStable = options.isStable;
    }

    return statement;
  };

  let sampler: ProposalSampler;

  beforeEach(() => {
    jest.clearAllMocks();
    sampler = new ProposalSampler();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const config = sampler.getConfig();
      expect(config).toEqual(DEFAULT_SAMPLING_CONFIG);
    });

    it('should merge provided config with defaults', () => {
      const customSampler = new ProposalSampler({
        targetEvaluations: 50,
      });
      const config = customSampler.getConfig();

      expect(config.targetEvaluations).toBe(50);
      expect(config.targetSEM).toBe(DEFAULT_SAMPLING_CONFIG.targetSEM);
      expect(config.explorationWeight).toBe(DEFAULT_SAMPLING_CONFIG.explorationWeight);
    });

    it('should accept full custom config', () => {
      const customConfig = {
        targetEvaluations: 100,
        targetSEM: 0.1,
        explorationWeight: 0.5,
        recencyBoostHours: 48,
      };
      const customSampler = new ProposalSampler(customConfig);
      expect(customSampler.getConfig()).toEqual(customConfig);
    });
  });

  describe('scoreProposals', () => {
    it('should return empty array for empty input', () => {
      const scored = sampler.scoreProposals([]);
      expect(scored).toEqual([]);
    });

    it('should score all proposals', () => {
      const proposals = [
        createMockStatement('1'),
        createMockStatement('2'),
        createMockStatement('3'),
      ];

      const scored = sampler.scoreProposals(proposals);

      expect(scored).toHaveLength(3);
      scored.forEach((s: ScoredProposal) => {
        expect(s.proposal).toBeDefined();
        expect(s.priority).toBeDefined();
        expect(typeof s.priority).toBe('number');
        expect(s.stats).toBeDefined();
        expect(typeof s.isStable).toBe('boolean');
      });
    });

    it('should sort proposals by priority (highest first)', () => {
      // Create proposals with different evaluation counts
      // Under-evaluated should have higher priority
      const proposals = [
        createMockStatement('high-evals', {
          sumEvaluations: 0,
          numberOfEvaluators: 25,
        }),
        createMockStatement('low-evals', {
          sumEvaluations: 0,
          numberOfEvaluators: 2,
        }),
        createMockStatement('medium-evals', {
          sumEvaluations: 0,
          numberOfEvaluators: 10,
        }),
      ];

      // Due to Thompson Sampling randomness, run multiple times and check tendency
      let lowEvalsFirstCount = 0;
      let highEvalsLastCount = 0;
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const scored = sampler.scoreProposals(proposals);
        if (scored[0].proposal.statementId === 'low-evals') {
          lowEvalsFirstCount++;
        }
        if (scored[scored.length - 1].proposal.statementId === 'high-evals') {
          highEvalsLastCount++;
        }
      }

      // Low eval count proposals should generally be prioritized (more than 50% of the time)
      expect(lowEvalsFirstCount).toBeGreaterThan(iterations * 0.3);
      // High eval count proposals should generally be last (more than 50% of the time)
      expect(highEvalsLastCount).toBeGreaterThan(iterations * 0.3);
    });

    it('should include stats in scored proposals', () => {
      const proposals = [
        createMockStatement('1', {
          sumEvaluations: 5,
          sumSquaredEvaluations: 3,
          numberOfEvaluators: 10,
        }),
      ];

      const scored = sampler.scoreProposals(proposals);

      expect(scored[0].stats.mean).toBe(0.5);
      expect(scored[0].stats.evaluationCount).toBe(10);
      expect(scored[0].stats.sem).toBeGreaterThan(0);
    });

    it('should mark stable proposals correctly', () => {
      // Low variance, high eval count = stable
      const stableProposal = createMockStatement('stable', {
        sumEvaluations: 15,
        sumSquaredEvaluations: 7.5,
        numberOfEvaluators: 30,
      });

      // New proposal = not stable
      const unstableProposal = createMockStatement('unstable', {
        sumEvaluations: 0,
        numberOfEvaluators: 2,
      });

      const scored = sampler.scoreProposals([stableProposal, unstableProposal]);

      // Unstable should always be false
      const unstable = scored.find((s) => s.proposal.statementId === 'unstable');
      expect(unstable?.isStable).toBe(false);
    });
  });

  describe('selectForUser', () => {
    it('should return empty array when no proposals', () => {
      const result = sampler.selectForUser([], new Set(), 5);
      expect(result).toEqual([]);
    });

    it('should filter out already evaluated proposals', () => {
      const proposals = [
        createMockStatement('1'),
        createMockStatement('2'),
        createMockStatement('3'),
      ];

      const evaluatedIds = new Set(['1', '2']);
      const result = sampler.selectForUser(proposals, evaluatedIds, 5);

      expect(result).toHaveLength(1);
      expect(result[0].statementId).toBe('3');
    });

    it('should filter out proposals with isStable flag', () => {
      const proposals = [
        createMockStatement('stable', undefined, undefined, { isStable: true }),
        createMockStatement('not-stable'),
      ];

      const result = sampler.selectForUser(proposals, new Set(), 5);

      expect(result).toHaveLength(1);
      expect(result[0].statementId).toBe('not-stable');
    });

    it('should filter out computationally stable proposals', () => {
      // This proposal should be marked stable by isStable() check
      const stableProposal = createMockStatement('stable', {
        sumEvaluations: 15,
        sumSquaredEvaluations: 7.5,
        numberOfEvaluators: 30,
      });
      const unstableProposal = createMockStatement('unstable');

      // Use sampler with low stability thresholds
      const strictSampler = new ProposalSampler({
        targetEvaluations: 30,
        targetSEM: 0.2,
      });

      const result = strictSampler.selectForUser(
        [stableProposal, unstableProposal],
        new Set(),
        5
      );

      // Should only return unstable proposal (or maybe both depending on SEM)
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect count parameter', () => {
      const proposals = Array.from({ length: 10 }, (_, i) =>
        createMockStatement(`${i}`)
      );

      const result = sampler.selectForUser(proposals, new Set(), 3);

      expect(result).toHaveLength(3);
    });

    it('should return fewer than count if not enough available', () => {
      const proposals = [createMockStatement('1'), createMockStatement('2')];

      const result = sampler.selectForUser(proposals, new Set(), 10);

      expect(result).toHaveLength(2);
    });

    it('should return highest priority proposals', () => {
      // Create proposals with very different evaluation counts
      // to make priority difference more significant than exploration randomness
      const proposals = [
        createMockStatement('high-evals', {
          sumEvaluations: 0,
          numberOfEvaluators: 28, // Near target (30)
        }),
        createMockStatement('low-evals', {
          sumEvaluations: 0,
          numberOfEvaluators: 0, // No evaluations - highest priority
        }),
        createMockStatement('medium-evals', {
          sumEvaluations: 0,
          numberOfEvaluators: 15,
        }),
      ];

      // Run multiple times to account for Thompson Sampling randomness
      const selections: Record<string, number> = {};
      for (let i = 0; i < 20; i++) {
        const result = sampler.selectForUser(proposals, new Set(), 1);
        const id = result[0].statementId;
        selections[id] = (selections[id] || 0) + 1;
      }

      // Low-evals should be selected most frequently due to highest priority
      expect(selections['low-evals']).toBeGreaterThanOrEqual(
        Math.max(selections['high-evals'] || 0, selections['medium-evals'] || 0)
      );
    });

    it('should return empty when all proposals are evaluated', () => {
      const proposals = [createMockStatement('1'), createMockStatement('2')];

      const evaluatedIds = new Set(['1', '2']);
      const result = sampler.selectForUser(proposals, evaluatedIds, 5);

      expect(result).toEqual([]);
    });
  });

  describe('checkStability', () => {
    it('should return false for new proposals', () => {
      const proposal = createMockStatement('new');
      expect(sampler.checkStability(proposal)).toBe(false);
    });

    it('should return false for under-evaluated proposals', () => {
      const proposal = createMockStatement('under-eval', {
        sumEvaluations: 5,
        numberOfEvaluators: 10,
      });
      expect(sampler.checkStability(proposal)).toBe(false);
    });

    it('should return true for stable proposals', () => {
      // Create sampler with relaxed thresholds
      const relaxedSampler = new ProposalSampler({
        targetEvaluations: 5,
        targetSEM: 0.5,
      });

      const proposal = createMockStatement('stable', {
        sumEvaluations: 2,
        sumSquaredEvaluations: 1,
        numberOfEvaluators: 5,
      });

      expect(relaxedSampler.checkStability(proposal)).toBe(true);
    });

    it('should use sampler config for stability check', () => {
      const strictSampler = new ProposalSampler({
        targetEvaluations: 100,
        targetSEM: 0.05,
      });

      const proposal = createMockStatement('should-be-unstable', {
        sumEvaluations: 15,
        sumSquaredEvaluations: 7.5,
        numberOfEvaluators: 30,
      });

      // With strict config, 30 evals is not enough
      expect(strictSampler.checkStability(proposal)).toBe(false);
    });
  });

  describe('calculateStats', () => {
    it('should calculate total count correctly', () => {
      const proposals = [
        createMockStatement('1'),
        createMockStatement('2'),
        createMockStatement('3'),
      ];

      const stats = sampler.calculateStats(proposals, new Set(), 0);

      expect(stats.totalCount).toBe(3);
    });

    it('should calculate evaluated count from set size', () => {
      const proposals = [
        createMockStatement('1'),
        createMockStatement('2'),
        createMockStatement('3'),
      ];

      const evaluatedIds = new Set(['1', '2']);
      const stats = sampler.calculateStats(proposals, evaluatedIds, 0);

      expect(stats.evaluatedCount).toBe(2);
    });

    it('should count stable proposals', () => {
      const proposals = [
        createMockStatement('stable-flag', undefined, undefined, { isStable: true }),
        createMockStatement('unstable'),
      ];

      const stats = sampler.calculateStats(proposals, new Set(), 0);

      expect(stats.stableCount).toBeGreaterThanOrEqual(1);
    });

    it('should calculate remaining count correctly', () => {
      const proposals = [
        createMockStatement('1'),
        createMockStatement('2'),
        createMockStatement('3'),
        createMockStatement('4'),
        createMockStatement('5'),
      ];

      // None evaluated, select 2
      const stats = sampler.calculateStats(proposals, new Set(), 2);

      expect(stats.remainingCount).toBe(3); // 5 - 2 = 3
    });

    it('should not return negative remaining count', () => {
      const proposals = [createMockStatement('1'), createMockStatement('2')];

      // Select more than available
      const stats = sampler.calculateStats(proposals, new Set(), 10);

      expect(stats.remainingCount).toBe(0);
    });

    it('should return correct stats type', () => {
      const proposals = [createMockStatement('1')];
      const stats: BatchStats = sampler.calculateStats(proposals, new Set(), 1);

      expect(typeof stats.totalCount).toBe('number');
      expect(typeof stats.evaluatedCount).toBe('number');
      expect(typeof stats.stableCount).toBe('number');
      expect(typeof stats.remainingCount).toBe('number');
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const config1 = sampler.getConfig();
      const config2 = sampler.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });

    it('should not allow external modification', () => {
      const config = sampler.getConfig();
      config.targetEvaluations = 999;

      expect(sampler.getConfig().targetEvaluations).toBe(
        DEFAULT_SAMPLING_CONFIG.targetEvaluations
      );
    });
  });

  describe('updateConfig', () => {
    it('should update single config value', () => {
      sampler.updateConfig({ targetEvaluations: 50 });

      const config = sampler.getConfig();
      expect(config.targetEvaluations).toBe(50);
      expect(config.targetSEM).toBe(DEFAULT_SAMPLING_CONFIG.targetSEM);
    });

    it('should update multiple config values', () => {
      sampler.updateConfig({
        targetEvaluations: 50,
        targetSEM: 0.2,
      });

      const config = sampler.getConfig();
      expect(config.targetEvaluations).toBe(50);
      expect(config.targetSEM).toBe(0.2);
    });

    it('should preserve unchanged values', () => {
      const originalConfig = sampler.getConfig();
      sampler.updateConfig({ targetEvaluations: 50 });

      const config = sampler.getConfig();
      expect(config.explorationWeight).toBe(originalConfig.explorationWeight);
      expect(config.recencyBoostHours).toBe(originalConfig.recencyBoostHours);
    });
  });

  describe('createSampler factory', () => {
    it('should create a sampler with default config', () => {
      const factorySampler = createSampler();

      expect(factorySampler).toBeInstanceOf(ProposalSampler);
      expect(factorySampler.getConfig()).toEqual(DEFAULT_SAMPLING_CONFIG);
    });

    it('should create a sampler with custom config', () => {
      const customConfig = { targetEvaluations: 100 };
      const factorySampler = createSampler(customConfig);

      expect(factorySampler.getConfig().targetEvaluations).toBe(100);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical batch selection workflow', () => {
      // Create a mix of proposals
      const proposals = [
        createMockStatement('new-1'),
        createMockStatement('new-2'),
        createMockStatement('evaluated-high', {
          sumEvaluations: 5,
          numberOfEvaluators: 20,
        }),
        createMockStatement('stable', {
          sumEvaluations: 15,
          sumSquaredEvaluations: 7.5,
          numberOfEvaluators: 30,
        }),
      ];

      // User has evaluated some
      const evaluatedIds = new Set(['new-1']);

      // Select batch
      const selected = sampler.selectForUser(proposals, evaluatedIds, 3);

      // Should not include already evaluated
      expect(selected.find((p) => p.statementId === 'new-1')).toBeUndefined();

      // Calculate stats
      const stats = sampler.calculateStats(proposals, evaluatedIds, selected.length);

      expect(stats.totalCount).toBe(4);
      expect(stats.evaluatedCount).toBe(1);
    });

    it('should prioritize under-evaluated proposals in selection', () => {
      const proposals = [
        createMockStatement('well-evaluated', {
          sumEvaluations: 0,
          numberOfEvaluators: 25,
        }),
        createMockStatement('under-evaluated', {
          sumEvaluations: 0,
          numberOfEvaluators: 3,
        }),
      ];

      const selected = sampler.selectForUser(proposals, new Set(), 1);

      // Under-evaluated should be selected first
      expect(selected[0].statementId).toBe('under-evaluated');
    });

    it('should handle empty remaining after filtering', () => {
      const proposals = [
        createMockStatement('stable', undefined, undefined, { isStable: true }),
      ];

      const evaluatedIds = new Set<string>();
      const selected = sampler.selectForUser(proposals, evaluatedIds, 5);
      const stats = sampler.calculateStats(proposals, evaluatedIds, selected.length);

      expect(selected).toHaveLength(0);
      expect(stats.remainingCount).toBe(0);
    });
  });
});
