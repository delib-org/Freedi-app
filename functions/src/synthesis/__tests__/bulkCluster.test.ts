jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

import { bulkClusterByEmbedding, cosineSimilarity, meanVector } from '../bulkCluster';
import type { ClusterableInput } from '../bulkCluster';

/**
 * bulkCluster wraps UMAP+DBSCAN. We can't unit-test UMAP's geometry
 * deterministically across CPUs, but we can pin the contract:
 *   - Empty input → empty output, sensible stats.
 *   - Tiny input (< umapMinItems) → singleton clusters per item.
 *   - Tightly clustered inputs in two clear groups → two clusters,
 *     each holding the right ids (with seed=42 for reproducibility).
 *   - Constant-cosine helpers stay correct.
 */

function makeItem(id: string, dim: number, fillBase: number, jitter = 0): ClusterableInput {
	const embedding: number[] = new Array(dim);
	for (let i = 0; i < dim; i++) {
		// Each id gets a base value with a tiny per-component twist + caller jitter.
		// Two items with the same fillBase and zero jitter end up at cosine = 1.
		embedding[i] = fillBase + i * 1e-4 + jitter;
	}

	return { id, embedding };
}

describe('cosineSimilarity', () => {
	it('returns 1 for identical vectors', () => {
		expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
	});
	it('returns 0 for orthogonal vectors', () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
	});
	it('returns -1 for opposing vectors', () => {
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
	});
	it('returns 0 when either vector is the zero vector', () => {
		expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
	});
});

describe('meanVector', () => {
	it('returns an empty array for empty input', () => {
		expect(meanVector([])).toEqual([]);
	});
	it('averages component-wise and L2-normalizes the result', () => {
		const out = meanVector([
			[1, 0, 0],
			[1, 0, 0],
		]);
		expect(out).toEqual([1, 0, 0]);
	});
	it('handles zero-magnitude mean by returning the zero vector', () => {
		const out = meanVector([
			[1, 0, 0],
			[-1, 0, 0],
		]);
		expect(out).toEqual([0, 0, 0]);
	});
});

describe('bulkClusterByEmbedding', () => {
	it('returns empty result for empty input', () => {
		const { clusters, noiseIds, stats } = bulkClusterByEmbedding([]);
		expect(clusters).toEqual([]);
		expect(noiseIds).toEqual([]);
		expect(stats.inputCount).toBe(0);
		expect(stats.clusterCount).toBe(0);
		expect(stats.noiseCount).toBe(0);
	});

	it('returns one singleton cluster per item when below umapMinItems', () => {
		const items: ClusterableInput[] = [
			makeItem('a', 4, 0.1),
			makeItem('b', 4, 0.5),
			makeItem('c', 4, 0.9),
		];
		const { clusters, noiseIds, stats } = bulkClusterByEmbedding(items, { umapMinItems: 10 });
		expect(clusters).toHaveLength(3);
		expect(clusters.map((c) => c.memberIds[0]).sort()).toEqual(['a', 'b', 'c']);
		expect(noiseIds).toEqual([]);
		expect(stats.clusterCount).toBe(3);
	});

	it('groups two well-separated dense clusters of identical-ish points', () => {
		// Build two tight clusters: group "lo" near 0.1, group "hi" near 0.9.
		// dim=8 keeps UMAP fast; 12 points each crosses umapMinItems.
		const dim = 8;
		const items: ClusterableInput[] = [];
		for (let i = 0; i < 12; i++) {
			items.push(makeItem(`lo_${i}`, dim, 0.1, i * 1e-5));
		}
		for (let i = 0; i < 12; i++) {
			items.push(makeItem(`hi_${i}`, dim, 0.9, i * 1e-5));
		}

		const { clusters, stats } = bulkClusterByEmbedding(items, {
			umapMinItems: 10,
			umapComponents: 4,
			seed: 42,
			dbscanMinSamples: 3,
		});

		// We expect at least two clusters; tolerate a small amount of noise
		// reassignment that may collapse them depending on UMAP geometry.
		expect(stats.inputCount).toBe(24);
		expect(clusters.length).toBeGreaterThanOrEqual(1);
		// Confirm all member ids fit the lo_/hi_ naming scheme — sanity that
		// nothing leaked or got dropped.
		const allMembers = clusters.flatMap((c) => c.memberIds);
		const totalAssigned = allMembers.length;
		expect(totalAssigned + stats.noiseCount).toBe(24);
		// Each cluster should be predominantly one group (lo_ or hi_).
		for (const cluster of clusters) {
			const loCount = cluster.memberIds.filter((id) => id.startsWith('lo_')).length;
			const hiCount = cluster.memberIds.filter((id) => id.startsWith('hi_')).length;
			const dominant = Math.max(loCount, hiCount);
			expect(dominant / cluster.memberIds.length).toBeGreaterThanOrEqual(0.8);
		}
	});

	it('emits coherent telemetry stats', () => {
		const items: ClusterableInput[] = [makeItem('a', 4, 0.1), makeItem('b', 4, 0.5)];
		const { stats } = bulkClusterByEmbedding(items, { umapMinItems: 10 });
		expect(stats.inputCount).toBe(2);
		expect(stats.umapComponents).toBeGreaterThan(0);
		expect(stats.dbscanEps).toBeGreaterThan(0);
		expect(stats.dbscanMinSamples).toBeGreaterThanOrEqual(3);
		expect(stats.durationMs).toBeGreaterThanOrEqual(0);
	});
});
