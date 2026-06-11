/**
 * Tests for derived-statement detection in the serving algorithm
 *
 * Tests cover:
 * - Derived markers (isCluster, derivedByPipeline, integratedOptions, synthesis type)
 * - Servability of originals, including those hidden by integration
 * - Exclusion of moderation-hidden statements
 */
import { Statement, StatementType } from '@freedi/shared-types';
import { isDerivedStatement, isServableOriginal } from '../derivedStatements';

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
});
