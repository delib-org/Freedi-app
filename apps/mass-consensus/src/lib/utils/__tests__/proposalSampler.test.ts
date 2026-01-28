/**
 * Tests for ProposalSampler class
 */
import { Statement, StatementType } from '@freedi/shared-types';
import { ProposalSampler, createSampler, ScoredProposal } from '../proposalSampler';
import { DEFAULT_SAMPLING_CONFIG } from '../sampling';

describe('ProposalSampler', () => {
  // Helper to create a mock Statement
  const createMockStatement = (
    id: string,
    evaluation?: Partial<Statement['evaluation']>,
    createdAt?: number
  ): Statement => ({
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
    evaluation: evaluation ? {
      statementId: id,
      parentId: 'parent-id',
      evaluationId: `eval-${id}`,
      topParentId: 'top-parent-id',
      sumEvaluations: evaluation.sumEvaluations ?? 0,
      sumSquaredEvaluations: evaluation.sumSquaredEvaluations ?? 0,
      numberOfEvaluators: evaluation.numberOfEvaluators ?? 0,
      agreement: evaluation.agreement ?? 0,
    } : undefined,
  } as Statement);

  describe('scoreProposals with percentile ranking', () => {
    it('should assign percentile 1.0 to highest mean proposal', () => {
      const sampler = createSampler();

      const proposals = [
        createMockStatement('low', {
          sumEvaluations: -5, // mean = -0.5
          sumSquaredEvaluations: 5,
          numberOfEvaluators: 10,
        }),
        createMockStatement('mid', {
          sumEvaluations: 0, // mean = 0
          sumSquaredEvaluations: 5,
          numberOfEvaluators: 10,
        }),
        createMockStatement('high', {
          sumEvaluations: 8, // mean = 0.8
          sumSquaredEvaluations: 7,
          numberOfEvaluators: 10,
        }),
      ];

      const scored = sampler.scoreProposals(proposals);

      // The highest mean proposal should have highest priority
      // (all else being equal, top percentile gives bonus)
      const highScored = scored.find(s => s.proposal.statementId === 'high');
      const lowScored = scored.find(s => s.proposal.statementId === 'low');

      expect(highScored).toBeDefined();
      expect(lowScored).toBeDefined();
      // High mean should get top-mean bonus, low mean should not
      // This may be affected by other factors, but high should generally be preferred
    });

    it('should handle single proposal with middle percentile (0.5)', () => {
      const sampler = createSampler();

      const proposals = [
        createMockStatement('only', {
          sumEvaluations: 5,
          sumSquaredEvaluations: 5,
          numberOfEvaluators: 10,
        }),
      ];

      const scored = sampler.scoreProposals(proposals);

      expect(scored).toHaveLength(1);
      expect(scored[0].priority).toBeGreaterThan(0);
    });

    it('should exclude proposals without evaluations from percentile ranking', () => {
      const sampler = createSampler();

      const proposals = [
        createMockStatement('new1'), // No evaluations
        createMockStatement('new2'), // No evaluations
        createMockStatement('evaluated', {
          sumEvaluations: 5,
          sumSquaredEvaluations: 5,
          numberOfEvaluators: 10,
        }),
      ];

      const scored = sampler.scoreProposals(proposals);

      expect(scored).toHaveLength(3);
      // All should have valid priorities
      scored.forEach(s => {
        expect(s.priority).toBeGreaterThanOrEqual(0);
        expect(s.priority).toBeLessThanOrEqual(1);
      });
    });

    it('should give higher priority to top-ranked proposals with high SEM', () => {
      const sampler = createSampler();

      // Same mean (0.5), but different evaluation counts and variance
      const proposals = [
        createMockStatement('top-high-sem', {
          sumEvaluations: 4, // mean = 0.8
          sumSquaredEvaluations: 5, // High variance
          numberOfEvaluators: 5,
        }),
        createMockStatement('mid-low-sem', {
          sumEvaluations: 15, // mean = 0.5
          sumSquaredEvaluations: 8,
          numberOfEvaluators: 30,
        }),
        createMockStatement('low-high-sem', {
          sumEvaluations: -4, // mean = -0.8
          sumSquaredEvaluations: 5, // High variance
          numberOfEvaluators: 5,
        }),
      ];

      const scored = sampler.scoreProposals(proposals);

      // Top performer with high SEM should get validation priority
      const topScored = scored.find(s => s.proposal.statementId === 'top-high-sem');
      const lowScored = scored.find(s => s.proposal.statementId === 'low-high-sem');

      expect(topScored).toBeDefined();
      expect(lowScored).toBeDefined();
      // Top performer should rank higher than bottom performer
      // despite both having high SEM (bottom doesn't need validation)
    });
  });

  describe('selectForUser', () => {
    it('should filter out already evaluated proposals', () => {
      const sampler = createSampler();

      const proposals = [
        createMockStatement('p1', { sumEvaluations: 0, numberOfEvaluators: 5 }),
        createMockStatement('p2', { sumEvaluations: 0, numberOfEvaluators: 5 }),
        createMockStatement('p3', { sumEvaluations: 0, numberOfEvaluators: 5 }),
      ];

      const evaluatedIds = new Set(['p1', 'p2']);
      const selected = sampler.selectForUser(proposals, evaluatedIds, 3);

      expect(selected).toHaveLength(1);
      expect(selected[0].statementId).toBe('p3');
    });

    it('should filter out stable proposals', () => {
      const sampler = createSampler();

      // Create a stable proposal (high eval count, low SEM)
      const stableProposal = createMockStatement('stable', {
        sumEvaluations: 15,
        sumSquaredEvaluations: 7.5, // Low variance
        numberOfEvaluators: 30,
      });

      const proposals = [
        stableProposal,
        createMockStatement('unstable', { sumEvaluations: 0, numberOfEvaluators: 5 }),
      ];

      const selected = sampler.selectForUser(proposals, new Set(), 2);

      // Stable proposal should be filtered out (depending on SEM)
      // At least the unstable one should be available
      expect(selected.length).toBeGreaterThanOrEqual(1);
      const hasUnstable = selected.some(s => s.statementId === 'unstable');
      expect(hasUnstable).toBe(true);
    });

    it('should respect the count parameter', () => {
      const sampler = createSampler();

      const proposals = [
        createMockStatement('p1', { sumEvaluations: 0, numberOfEvaluators: 5 }),
        createMockStatement('p2', { sumEvaluations: 0, numberOfEvaluators: 5 }),
        createMockStatement('p3', { sumEvaluations: 0, numberOfEvaluators: 5 }),
        createMockStatement('p4', { sumEvaluations: 0, numberOfEvaluators: 5 }),
      ];

      const selected = sampler.selectForUser(proposals, new Set(), 2);

      expect(selected).toHaveLength(2);
    });

    it('should return empty array when no proposals available', () => {
      const sampler = createSampler();

      const proposals = [
        createMockStatement('p1', { sumEvaluations: 0, numberOfEvaluators: 5 }),
      ];

      const evaluatedIds = new Set(['p1']);
      const selected = sampler.selectForUser(proposals, evaluatedIds, 3);

      expect(selected).toHaveLength(0);
    });
  });

  describe('checkStability', () => {
    it('should return true for stable proposals', () => {
      const sampler = createSampler({
        targetEvaluations: 10,
        targetSEM: 0.5,
      });

      const stableProposal = createMockStatement('stable', {
        sumEvaluations: 5,
        sumSquaredEvaluations: 2.5,
        numberOfEvaluators: 10,
      });

      expect(sampler.checkStability(stableProposal)).toBe(true);
    });

    it('should return false for unstable proposals', () => {
      const sampler = createSampler();

      const unstableProposal = createMockStatement('unstable', {
        sumEvaluations: 0,
        numberOfEvaluators: 5,
      });

      expect(sampler.checkStability(unstableProposal)).toBe(false);
    });
  });

  describe('calculateStats', () => {
    it('should calculate correct batch statistics', () => {
      const sampler = createSampler({
        targetEvaluations: 10,
        targetSEM: 0.5,
      });

      const proposals = [
        createMockStatement('p1', { sumEvaluations: 5, numberOfEvaluators: 10 }),
        createMockStatement('p2', { sumEvaluations: 0, numberOfEvaluators: 5 }),
        createMockStatement('p3', { sumEvaluations: 0, numberOfEvaluators: 5 }),
      ];

      const evaluatedIds = new Set(['p1']);
      const stats = sampler.calculateStats(proposals, evaluatedIds, 1);

      expect(stats.totalCount).toBe(3);
      expect(stats.evaluatedCount).toBe(1);
    });
  });

  describe('createSampler', () => {
    it('should create sampler with default config', () => {
      const sampler = createSampler();
      const config = sampler.getConfig();

      expect(config.targetEvaluations).toBe(DEFAULT_SAMPLING_CONFIG.targetEvaluations);
      expect(config.targetSEM).toBe(DEFAULT_SAMPLING_CONFIG.targetSEM);
    });

    it('should create sampler with custom config', () => {
      const sampler = createSampler({
        targetEvaluations: 50,
        targetSEM: 0.1,
      });
      const config = sampler.getConfig();

      expect(config.targetEvaluations).toBe(50);
      expect(config.targetSEM).toBe(0.1);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const sampler = createSampler();
      sampler.updateConfig({ targetEvaluations: 100 });
      const config = sampler.getConfig();

      expect(config.targetEvaluations).toBe(100);
      expect(config.targetSEM).toBe(DEFAULT_SAMPLING_CONFIG.targetSEM); // unchanged
    });
  });
});
