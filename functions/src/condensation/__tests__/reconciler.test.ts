import { reconcileGroups, hashIntegratedOptions } from '../reconciler';
import type { Statement } from '@freedi/shared-types';

/**
 * The reconciler is the critical idempotency gate. If it's wrong, every
 * scheduled run of the pipeline produces duplicate cluster statements. So
 * these tests focus on the three invariants:
 *   1. A new proposal with no overlap → kind=create
 *   2. A proposal that overlaps an existing cluster ≥ threshold → kind=update
 *   3. 1:1 assignment — the same existing cluster cannot match twice per run
 */

function cluster(id: string, members: string[]): Statement {
	return {
		statementId: id,
		statement: id,
		parentId: 'q1',
		topParentId: 'q1',
		creatorId: 'u',
		isCluster: true,
		integratedOptions: members,
		// filler required fields (ignored by the reconciler but typed)
		consensus: 0,
		createdAt: 0,
		lastUpdate: 0,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe('reconciler', () => {
	it('creates a new cluster when no existing cluster overlaps enough', () => {
		const { groups } = reconcileGroups(
			[{ sourceIds: ['a', 'b', 'c'] }],
			[cluster('K1', ['x', 'y', 'z'])],
			0.5,
		);
		expect(groups[0].kind).toBe('create');
	});

	it('updates in place when Jaccard ≥ threshold', () => {
		const existing = cluster('K1', ['a', 'b', 'c', 'd']);
		const { groups } = reconcileGroups(
			[{ sourceIds: ['a', 'b', 'c', 'e'] }], // Jaccard = 3/5 = 0.6
			[existing],
			0.5,
		);
		expect(groups[0].kind).toBe('update');
		expect(groups[0].existingClusterId).toBe('K1');
	});

	it('does not match when Jaccard is below threshold', () => {
		const { groups } = reconcileGroups(
			[{ sourceIds: ['a', 'b'] }], // Jaccard vs ['a','x','y','z'] = 1/5 = 0.2
			[cluster('K1', ['a', 'x', 'y', 'z'])],
			0.5,
		);
		expect(groups[0].kind).toBe('create');
	});

	it('greedy 1:1 — the same existing cluster is not assigned twice', () => {
		const existing = [
			cluster('K1', ['a', 'b', 'c', 'd']),
			cluster('K2', ['x', 'y', 'z']),
		];
		const { groups } = reconcileGroups(
			[
				{ sourceIds: ['a', 'b', 'c'] }, // matches K1 (3/4 = 0.75)
				{ sourceIds: ['a', 'b'] }, // also overlaps K1 but lower
			],
			existing,
			0.5,
		);
		const kinds = groups.map((g) => g.kind);
		expect(kinds.filter((k) => k === 'update').length).toBe(1);
		expect(kinds.filter((k) => k === 'create').length).toBe(1);
	});

	it('surfaces orphaned existing clusters (no proposal matched)', () => {
		const { orphanedClusterIds } = reconcileGroups(
			[{ sourceIds: ['a', 'b'] }],
			[cluster('K1', ['x', 'y', 'z'])],
			0.5,
		);
		expect(orphanedClusterIds).toContain('K1');
	});

	it('hash is order-independent — critical for the cost gate', () => {
		expect(hashIntegratedOptions(['a', 'b', 'c'])).toBe(
			hashIntegratedOptions(['c', 'a', 'b']),
		);
	});
});
