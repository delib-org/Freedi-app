import densityClustering from 'density-clustering';
import { UMAP } from 'umap-js';
import { logger } from 'firebase-functions';
import {
	DBSCAN_EPS,
	DBSCAN_MIN_SAMPLES,
	NEAREST_CENTROID_THRESHOLD,
	UMAP_MIN_ITEMS,
	UMAP_TARGET_COMPONENTS,
} from './constants';
import type { ClusterGroup, ClusterableItem } from './types';

const { DBSCAN } = densityClustering;

function makeRng(seed: number): () => number {
	let s = seed;

	return () => {
		s = (s * 9301 + 49297) % 233280;

		return s / 233280;
	};
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function meanVector(vectors: number[][]): number[] {
	if (vectors.length === 0) return [];
	const dim = vectors[0].length;
	const out = new Array(dim).fill(0) as number[];
	for (const v of vectors) {
		for (let i = 0; i < dim; i++) out[i] += v[i];
	}
	for (let i = 0; i < dim; i++) out[i] /= vectors.length;
	let norm = 0;
	for (const x of out) norm += x * x;
	norm = Math.sqrt(norm);
	if (norm === 0) return out;
	for (let i = 0; i < dim; i++) out[i] /= norm;

	return out;
}

/**
 * Cluster the items belonging to a single category. Returns one ClusterGroup
 * per resulting cluster (plus a "uncategorized" group for points that DBSCAN
 * marks as noise and don't reach the nearest-centroid threshold).
 *
 * Members are referenced by their index into the input array.
 */
export function clusterCategory(categoryKey: string, items: ClusterableItem[]): ClusterGroup[] {
	if (items.length === 0) return [];

	// Tiny buckets: UMAP/DBSCAN aren't meaningful below ~10 points. Run a
	// cheap union-find on cosine similarity instead — items pairwise above
	// SMALL_BUCKET_LINK_THRESHOLD merge into the same group, outliers stay
	// in their own. This prevents two unrelated minority opinions that the
	// taxonomy LLM lumped together (e.g. "dogs in the park" + "parking
	// traffic studies") from being cemented into one cluster, while still
	// avoiding the singleton-per-item flood from the original fallback.
	if (items.length < UMAP_MIN_ITEMS) {
		const SMALL_BUCKET_LINK_THRESHOLD = 0.7;
		const parent = items.map((_, i) => i);
		const find = (i: number): number => {
			while (parent[i] !== i) {
				parent[i] = parent[parent[i]];
				i = parent[i];
			}

			return i;
		};
		const union = (a: number, b: number): void => {
			const ra = find(a);
			const rb = find(b);
			if (ra !== rb) parent[ra] = rb;
		};
		for (let i = 0; i < items.length; i++) {
			for (let j = i + 1; j < items.length; j++) {
				const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
				if (sim >= SMALL_BUCKET_LINK_THRESHOLD) union(i, j);
			}
		}
		const byRoot = new Map<number, number[]>();
		for (let i = 0; i < items.length; i++) {
			const r = find(i);
			const bucket = byRoot.get(r) ?? [];
			bucket.push(i);
			byRoot.set(r, bucket);
		}

		return Array.from(byRoot.values()).map((memberIndices, idx) => ({
			groupId: `${categoryKey}_${idx}`,
			categoryKey,
			clusterIndex: idx,
			memberIndices,
			centroid: meanVector(memberIndices.map((i) => items[i].embedding)),
		}));
	}

	const dim = items[0].embedding.length;
	const points = items.map((item) => item.embedding);

	// 1. UMAP: cosine on 1536-d → euclidean on UMAP_TARGET_COMPONENTS-d.
	const nNeighbors = Math.min(15, items.length - 1);
	const nComponents = Math.min(UMAP_TARGET_COMPONENTS, items.length - 2);
	const umap = new UMAP({
		nComponents,
		nNeighbors,
		minDist: 0.0,
		random: makeRng(42),
	});
	const embedded = umap.fit(points);

	// 2. DBSCAN on the projected space.
	const dbscan = new DBSCAN();
	const rawClusters: number[][] = dbscan.run(embedded, DBSCAN_EPS, DBSCAN_MIN_SAMPLES);
	const noiseIndices: number[] = dbscan.noise;
	logger.info(
		`Category ${categoryKey}: ${items.length} items → ${rawClusters.length} clusters, ${noiseIndices.length} noise`,
	);

	// 3. Build cluster groups with centroids on ORIGINAL embedding space (not UMAP-projected).
	const groups: ClusterGroup[] = rawClusters.map((memberIndices, idx) => {
		const memberVecs = memberIndices.map((i) => points[i]);

		return {
			groupId: `${categoryKey}_${idx}`,
			categoryKey,
			clusterIndex: idx,
			memberIndices,
			centroid: meanVector(memberVecs),
		};
	});

	// 4. Reassign noise to nearest centroid (cosine on original 1536-d) if > threshold.
	const uncategorizedIndices: number[] = [];
	for (const noiseIdx of noiseIndices) {
		const point = points[noiseIdx];
		let bestSim = -Infinity;
		let bestGroup: ClusterGroup | null = null;
		for (const group of groups) {
			if (!group.centroid) continue;
			const sim = cosineSimilarity(point, group.centroid);
			if (sim > bestSim) {
				bestSim = sim;
				bestGroup = group;
			}
		}
		if (bestGroup && bestSim >= NEAREST_CENTROID_THRESHOLD) {
			bestGroup.memberIndices.push(noiseIdx);
		} else {
			uncategorizedIndices.push(noiseIdx);
		}
	}

	// 5. Recompute centroids after noise reassignment.
	for (const group of groups) {
		group.centroid = meanVector(group.memberIndices.map((i) => points[i]));
	}

	if (uncategorizedIndices.length > 0) {
		groups.push({
			groupId: `${categoryKey}_uncategorized`,
			categoryKey,
			clusterIndex: -1,
			memberIndices: uncategorizedIndices,
			centroid: undefined, // no centroid for uncategorized — stays unmatched downstream
		});
	}

	// 6. Sanity: make sure dim is propagated even when zero-d edge cases hit.
	if (dim <= 0) logger.warn(`Category ${categoryKey} had zero-dim embeddings`);

	return groups;
}
