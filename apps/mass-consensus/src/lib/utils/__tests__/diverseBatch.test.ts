/**
 * Tests for cluster-diverse batch selection
 *
 * Tests cover:
 * - Membership map construction from cluster docs (integratedOptions)
 * - Cluster key precedence (map > legacy integratedInto > own id)
 * - Seen-cluster derivation for cross-batch rotation
 * - Round-robin selection: one-per-cluster, multi-pass, singleton fallback,
 *   rotation to unseen clusters, determinism
 */
import { Statement, StatementType } from '@freedi/shared-types';
import {
  buildClusterMembershipMap,
  getClusterKey,
  deriveSeenClusters,
  selectDiverseBatch,
} from '../diverseBatch';

describe('diverseBatch', () => {
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

  const cluster = (id: string, members: string[], overrides: Partial<Statement> = {}): Statement =>
    createMockStatement({
      statementId: id,
      isCluster: true,
      integratedOptions: members,
      ...overrides,
    });

  describe('buildClusterMembershipMap', () => {
    it('should map members of cluster docs to the cluster id', () => {
      const statements = [
        cluster('cluster-1', ['opt-a', 'opt-b']),
        createMockStatement({ statementId: 'opt-a' }),
        createMockStatement({ statementId: 'opt-b' }),
      ];

      const membership = buildClusterMembershipMap(statements);

      expect(membership.get('opt-a')).toBe('cluster-1');
      expect(membership.get('opt-b')).toBe('cluster-1');
    });

    it('should ignore plain options', () => {
      const membership = buildClusterMembershipMap([
        createMockStatement({ statementId: 'opt-a' }),
      ]);

      expect(membership.size).toBe(0);
    });

    it('should ignore hidden (dissolved) clusters', () => {
      const membership = buildClusterMembershipMap([
        cluster('cluster-1', ['opt-a'], { hide: true }),
      ]);

      expect(membership.size).toBe(0);
    });

    it('should ignore derived docs with empty integratedOptions', () => {
      const membership = buildClusterMembershipMap([
        createMockStatement({ statementId: 'synth-1', synthesisRunId: 'run-1' }),
      ]);

      expect(membership.size).toBe(0);
    });

    it('should keep the first claim when two clusters list the same member', () => {
      const membership = buildClusterMembershipMap([
        cluster('cluster-1', ['opt-a']),
        cluster('cluster-2', ['opt-a']),
      ]);

      expect(membership.get('opt-a')).toBe('cluster-1');
    });
  });

  describe('getClusterKey', () => {
    it('should prefer the membership map over integratedInto', () => {
      const statement = createMockStatement({
        statementId: 'opt-a',
        integratedInto: 'legacy-cluster',
      });
      const membership = new Map([['opt-a', 'cluster-1']]);

      expect(getClusterKey(statement, membership)).toBe('cluster-1');
    });

    it('should fall back to legacy integratedInto', () => {
      const statement = createMockStatement({
        statementId: 'opt-a',
        integratedInto: 'legacy-cluster',
      });

      expect(getClusterKey(statement, new Map())).toBe('legacy-cluster');
    });

    it('should fall back to own id (singleton) when unclustered', () => {
      const statement = createMockStatement({ statementId: 'opt-a' });

      expect(getClusterKey(statement, new Map())).toBe('opt-a');
    });
  });

  describe('deriveSeenClusters', () => {
    it('should map seen statement ids through the membership map', () => {
      const membership = new Map([
        ['opt-a', 'cluster-1'],
        ['opt-b', 'cluster-2'],
      ]);

      const seen = deriveSeenClusters(new Set(['opt-a', 'opt-c']), membership);

      expect(seen).toEqual(new Set(['cluster-1', 'opt-c']));
    });

    it('should return an empty set for no seen statements', () => {
      expect(deriveSeenClusters(new Set(), new Map()).size).toBe(0);
    });
  });

  describe('selectDiverseBatch', () => {
    interface Item {
      id: string;
      clusterKey: string;
    }

    const item = (id: string, clusterKey: string): Item => ({ id, clusterKey });
    const keyOf = (i: Item): string => i.clusterKey;
    const ids = (items: Item[]): string[] => items.map((i) => i.id);

    it('should take one item per cluster on the first pass', () => {
      const candidates = [
        item('a1', 'A'),
        item('a2', 'A'),
        item('b1', 'B'),
        item('c1', 'C'),
      ];

      expect(ids(selectDiverseBatch(candidates, 3, keyOf))).toEqual(['a1', 'b1', 'c1']);
    });

    it('should order clusters by their best member rank', () => {
      const candidates = [
        item('b1', 'B'),
        item('a1', 'A'),
        item('a2', 'A'),
        item('c1', 'C'),
      ];

      expect(ids(selectDiverseBatch(candidates, 3, keyOf))).toEqual(['b1', 'a1', 'c1']);
    });

    it('should run multiple passes when clusters < size', () => {
      const candidates = [
        item('a1', 'A'),
        item('a2', 'A'),
        item('a3', 'A'),
        item('b1', 'B'),
        item('b2', 'B'),
      ];

      expect(ids(selectDiverseBatch(candidates, 4, keyOf))).toEqual(['a1', 'b1', 'a2', 'b2']);
    });

    it('should return the exact top-N slice when all items are singletons', () => {
      const candidates = [item('a', 'a'), item('b', 'b'), item('c', 'c'), item('d', 'd')];

      expect(ids(selectDiverseBatch(candidates, 3, keyOf))).toEqual(['a', 'b', 'c']);
    });

    it('should return all candidates when size exceeds candidate count', () => {
      const candidates = [item('a1', 'A'), item('a2', 'A')];

      expect(ids(selectDiverseBatch(candidates, 6, keyOf))).toEqual(['a1', 'a2']);
    });

    it('should return empty for empty input or non-positive size', () => {
      expect(selectDiverseBatch([], 6, keyOf)).toEqual([]);
      expect(selectDiverseBatch([item('a1', 'A')], 0, keyOf)).toEqual([]);
    });

    it('should be deterministic for identical input', () => {
      const candidates = [
        item('a1', 'A'),
        item('b1', 'B'),
        item('a2', 'A'),
        item('c1', 'C'),
      ];

      const first = ids(selectDiverseBatch(candidates, 3, keyOf));
      const second = ids(selectDiverseBatch(candidates, 3, keyOf));

      expect(first).toEqual(second);
    });

    it('should preserve within-cluster order across passes', () => {
      const candidates = [
        item('a1', 'A'),
        item('a2', 'A'),
        item('a3', 'A'),
      ];

      expect(ids(selectDiverseBatch(candidates, 3, keyOf))).toEqual(['a1', 'a2', 'a3']);
    });

    describe('cross-batch rotation (seenClusters)', () => {
      it('should serve unseen clusters before seen ones', () => {
        const candidates = [
          item('a1', 'A'),
          item('b1', 'B'),
          item('c1', 'C'),
          item('d1', 'D'),
        ];

        const batch = ids(
          selectDiverseBatch(candidates, 2, keyOf, new Set(['A', 'B']))
        );

        expect(batch).toEqual(['c1', 'd1']);
      });

      it('should rotate through all clusters across consecutive batches', () => {
        // 6 clusters, batch size 2 → 3 batches cover all clusters exactly once
        const candidates = ['A', 'B', 'C', 'D', 'E', 'F'].map((k) =>
          item(`${k.toLowerCase()}1`, k)
        );

        const seen = new Set<string>();
        const served: string[] = [];
        for (let batchNo = 0; batchNo < 3; batchNo++) {
          const batch = selectDiverseBatch(candidates, 2, keyOf, seen);
          batch.forEach((i) => {
            seen.add(i.clusterKey);
            served.push(i.id);
          });
        }

        expect(served).toEqual(['a1', 'b1', 'c1', 'd1', 'e1', 'f1']);
      });

      it('should cycle back to seen clusters once all are seen', () => {
        const candidates = [
          item('a1', 'A'),
          item('a2', 'A'),
          item('b1', 'B'),
          item('b2', 'B'),
        ];

        const batch = ids(
          selectDiverseBatch(candidates, 2, keyOf, new Set(['A', 'B']))
        );

        expect(batch).toEqual(['a1', 'b1']);
      });

      it('should fill from seen clusters when unseen ones run out', () => {
        const candidates = [
          item('a1', 'A'),
          item('b1', 'B'),
          item('c1', 'C'),
        ];

        const batch = ids(
          selectDiverseBatch(candidates, 3, keyOf, new Set(['A', 'B']))
        );

        expect(batch).toEqual(['c1', 'a1', 'b1']);
      });
    });
  });
});
