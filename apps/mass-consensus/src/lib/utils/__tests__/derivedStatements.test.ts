/**
 * Tests for derived-statement detection in the serving algorithm
 *
 * Tests cover:
 * - Derived markers (isCluster, derivedByPipeline, integratedOptions, synthesis type)
 * - Servability of originals, including those hidden by integration
 * - Exclusion of moderation-hidden statements
 */
import { Statement, StatementType } from '@freedi/shared-types';
import {
  isDerivedStatement,
  isServableOriginal,
  isSynthesisCluster,
  buildSynthMembershipMap,
  selectServableForEvaluation,
  expandEvaluatedIds,
} from '../derivedStatements';

describe('derivedStatements', () => {
  // Helper to create a mock Statement
  const createMockStatement = (overrides: Partial<Statement> = {}): Statement => ({
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
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    parents: ['parent-id'],
    topParentId: 'top-parent-id',
    hasChildren: false,
    resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
    results: [],
    consensus: 0,
    ...overrides,
  } as Statement);

  describe('isDerivedStatement', () => {
    it('should return false for a plain original option', () => {
      expect(isDerivedStatement(createMockStatement())).toBe(false);
    });

    it('should detect isCluster flag', () => {
      expect(isDerivedStatement(createMockStatement({ isCluster: true }))).toBe(true);
    });

    it('should detect synthesis pipeline origin', () => {
      expect(
        isDerivedStatement(createMockStatement({ derivedByPipeline: 'synthesis' }))
      ).toBe(true);
    });

    it('should detect topic-cluster pipeline origin', () => {
      expect(
        isDerivedStatement(createMockStatement({ derivedByPipeline: 'topic-cluster' }))
      ).toBe(true);
    });

    it('should detect non-empty integratedOptions', () => {
      expect(
        isDerivedStatement(createMockStatement({ integratedOptions: ['a', 'b'] }))
      ).toBe(true);
    });

    it('should NOT treat empty integratedOptions as derived', () => {
      expect(isDerivedStatement(createMockStatement({ integratedOptions: [] }))).toBe(false);
    });

    it('should detect synthesisRunId', () => {
      expect(isDerivedStatement(createMockStatement({ synthesisRunId: 'run-1' }))).toBe(true);
    });

    it('should detect synthesisMechanism', () => {
      expect(
        isDerivedStatement(createMockStatement({ synthesisMechanism: 'bulk' }))
      ).toBe(true);
    });

    it('should detect synthesis statementType', () => {
      expect(
        isDerivedStatement(createMockStatement({ statementType: StatementType.synthesis }))
      ).toBe(true);
    });

    it('should NOT treat an original hidden by integration as derived', () => {
      expect(
        isDerivedStatement(createMockStatement({ hide: true, integratedInto: 'cluster-1' }))
      ).toBe(false);
    });
  });

  describe('isServableOriginal', () => {
    it('should serve a plain visible original', () => {
      expect(isServableOriginal(createMockStatement())).toBe(true);
    });

    it('should NOT serve a cluster', () => {
      expect(
        isServableOriginal(
          createMockStatement({ isCluster: true, integratedOptions: ['a', 'b'] })
        )
      ).toBe(false);
    });

    it('should NOT serve a synthesis statement', () => {
      expect(
        isServableOriginal(createMockStatement({ derivedByPipeline: 'synthesis' }))
      ).toBe(false);
    });

    it('should serve an original hidden by integration', () => {
      expect(
        isServableOriginal(createMockStatement({ hide: true, integratedInto: 'cluster-1' }))
      ).toBe(true);
    });

    it('should NOT serve a moderation-hidden statement (no integratedInto)', () => {
      expect(isServableOriginal(createMockStatement({ hide: true }))).toBe(false);
    });

    it('should NOT serve a hidden cluster even with integratedInto set', () => {
      expect(
        isServableOriginal(
          createMockStatement({ hide: true, integratedInto: 'x', isCluster: true })
        )
      ).toBe(false);
    });
  });

  describe('synthesis clusters standing in for their members', () => {
    const synth = () =>
      createMockStatement({
        statementId: 'synth-1',
        isCluster: true,
        derivedByPipeline: 'synthesis',
        integratedOptions: ['a', 'b'],
      });
    const topic = () =>
      createMockStatement({
        statementId: 'topic-1',
        isCluster: true,
        derivedByPipeline: 'topic-cluster',
        integratedOptions: ['c', 'd'],
      });
    const original = (statementId: string) => createMockStatement({ statementId });

    describe('isSynthesisCluster', () => {
      it('should recognise a live synth with members', () => {
        expect(isSynthesisCluster(synth())).toBe(true);
      });

      it('should NOT count a topic cluster', () => {
        expect(isSynthesisCluster(topic())).toBe(false);
      });

      it('should NOT count a hidden (dissolved) synth', () => {
        expect(isSynthesisCluster({ ...synth(), hide: true })).toBe(false);
      });

      it('should NOT count a synth with no members', () => {
        expect(isSynthesisCluster({ ...synth(), integratedOptions: [] })).toBe(false);
      });
    });

    describe('buildSynthMembershipMap', () => {
      it('should map members of synths only', () => {
        const map = buildSynthMembershipMap([synth(), topic(), original('e')]);
        expect(map.get('a')).toBe('synth-1');
        expect(map.get('b')).toBe('synth-1');
        expect(map.has('c')).toBe(false);
        expect(map.has('e')).toBe(false);
      });
    });

    describe('selectServableForEvaluation', () => {
      it('should serve the synth instead of its members', () => {
        const served = selectServableForEvaluation([
          original('a'),
          original('b'),
          original('e'),
          synth(),
        ]);
        expect(served.map((s) => s.statementId).sort()).toEqual(['e', 'synth-1']);
      });

      it('should keep serving the members of a topic cluster, not the cluster', () => {
        const served = selectServableForEvaluation([original('c'), original('d'), topic()]);
        expect(served.map((s) => s.statementId).sort()).toEqual(['c', 'd']);
      });

      it('should fall back to the originals when the synth is dissolved', () => {
        const served = selectServableForEvaluation([
          original('a'),
          original('b'),
          { ...synth(), hide: true },
        ]);
        expect(served.map((s) => s.statementId).sort()).toEqual(['a', 'b']);
      });

      it('should still drop moderation-hidden originals', () => {
        const served = selectServableForEvaluation([
          { ...original('e'), hide: true },
          original('f'),
        ]);
        expect(served.map((s) => s.statementId)).toEqual(['f']);
      });
    });

    describe('expandEvaluatedIds', () => {
      it('should count a rated member as a rating of its synth', () => {
        const expanded = expandEvaluatedIds(['a'], [synth()]);
        expect(expanded.has('synth-1')).toBe(true);
        expect(expanded.has('b')).toBe(true);
      });

      it('should count a rated synth for every member', () => {
        const expanded = expandEvaluatedIds(['synth-1'], [synth()]);
        expect([...expanded].sort()).toEqual(['a', 'b', 'synth-1']);
      });

      it('should leave an untouched synth alone', () => {
        const expanded = expandEvaluatedIds(['e'], [synth()]);
        expect([...expanded]).toEqual(['e']);
      });

      it('should ignore topic clusters', () => {
        const expanded = expandEvaluatedIds(['c'], [topic()]);
        expect([...expanded]).toEqual(['c']);
      });
    });
  });
});
