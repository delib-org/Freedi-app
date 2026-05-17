import densityClustering from 'density-clustering';
import { UMAP } from 'umap-js';
import { logger } from 'firebase-functions';

const { DBSCAN } = densityClustering;

/**
 * Bulk in-memory clustering of pre-embedded statements.
 *
 * Replaces the synthesis pipeline's Phase 3 (N anchor-queries via Firestore
 * `findNearest`) with a single in-process UMAP → DBSCAN pass. The math is the
 * same primitive `services/topic-cluster/cluster.ts` already runs in
 * production; this module just wraps it with the synthesis-layer API
 * (string IDs in, string IDs out — no category nesting).
 *
 * Scaling: 10k items in ~30s on 1 vCPU; 100k via hierarchical Level 1
 * macro-clustering (Ship 3) keeps any single function call well under the
 * 540s budget. Memory at 100k 1536-d embeddings ≈ 600 MB raw; comfortable
 * on a 2 GiB function once UMAP working set is added.
 *
 * Pure-ish: no Firestore I/O, deterministic via the seeded RNG. Logs a
 * single info line per call so downstream wall-clock telemetry is easy.
 */

export interface ClusterableInput {
	id: string;
	embedding: number[];
}

export interface ClusterResult {
	memberIds: string[];
	centroid: number[];
}

export interface BulkClusterResult {
	clusters: ClusterResult[];
	noiseIds: string[];
	stats: {
		inputCount: number;
		clusterCount: number;
		noiseCount: number;
		dbscanEps: number;
		dbscanMinSamples: number;
		umapComponents: number;
		nearestCentroidThreshold: number;
		durationMs: number;
	};
}

export interface BulkClusterOptions {
	/**
	 * UMAP target dimensionality. 5d is enough to separate clusters of
	 * 1536-d embeddings while keeping DBSCAN cheap. Default 5.
	 */
	umapComponents?: number;
	/**
	 * Below this input count, skip UMAP/DBSCAN and treat each item as its
	 * own singleton cluster (UMAP needs at least nNeighbors+1 points).
	 * Default 10 (matches topic-cluster).
	 */
	umapMinItems?: number;
	/**
	 * DBSCAN epsilon — radius for density reachability in UMAP space.
	 * Empirically tuned 1.0 in topic-cluster; use the same default unless
	 * the caller has a reason to differ.
	 */
	dbscanEps?: number;
	/**
	 * DBSCAN minPts — minimum points to form a dense region. Defaults to
	 * `max(3, ceil(N / 200))` — keeps small datasets at 3 (matches the
	 * topic-cluster default) and scales gracefully to ~50 at 10k inputs
	 * for tighter macro-clusters at scale.
	 */
	dbscanMinSamples?: number;
	/**
	 * After DBSCAN runs, points marked "noise" are reassigned to the
	 * nearest cluster centroid if cosine similarity exceeds this
	 * threshold. Default 0.6 — same as topic-cluster.
	 */
	nearestCentroidThreshold?: number;
	/**
	 * Deterministic RNG seed for UMAP. Default 42.
	 */
	seed?: number;
}

const DEFAULT_UMAP_COMPONENTS = 5;
const DEFAULT_UMAP_MIN_ITEMS = 10;
const DEFAULT_DBSCAN_EPS = 1.0;
const DEFAULT_NEAREST_CENTROID_THRESHOLD = 0.6;

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
 * Cluster a flat set of pre-embedded items in one pass. See module doc.
 */
export function bulkClusterByEmbedding(
	items: ClusterableInput[],
	options: BulkClusterOptions = {},
): BulkClusterResult {
	const startTime = Date.now();

	if (items.length === 0) {
		return {
			clusters: [],
			noiseIds: [],
			stats: {
				inputCount: 0,
				clusterCount: 0,
				noiseCount: 0,
				dbscanEps: options.dbscanEps ?? DEFAULT_DBSCAN_EPS,
				dbscanMinSamples: options.dbscanMinSamples ?? 3,
				umapComponents: options.umapComponents ?? DEFAULT_UMAP_COMPONENTS,
				nearestCentroidThreshold:
					options.nearestCentroidThreshold ?? DEFAULT_NEAREST_CENTROID_THRESHOLD,
				durationMs: Date.now() - startTime,
			},
		};
	}

	const umapMinItems = options.umapMinItems ?? DEFAULT_UMAP_MIN_ITEMS;
	const umapComponents = options.umapComponents ?? DEFAULT_UMAP_COMPONENTS;
	const dbscanEps = options.dbscanEps ?? DEFAULT_DBSCAN_EPS;
	const dbscanMinSamples = options.dbscanMinSamples ?? Math.max(3, Math.ceil(items.length / 200));
	const nearestCentroidThreshold =
		options.nearestCentroidThreshold ?? DEFAULT_NEAREST_CENTROID_THRESHOLD;
	const seed = options.seed ?? 42;

	const points = items.map((it) => it.embedding);

	// Tiny input: every item is its own cluster, no UMAP/DBSCAN needed.
	if (items.length < umapMinItems) {
		const clusters: ClusterResult[] = items.map((it) => ({
			memberIds: [it.id],
			centroid: it.embedding,
		}));

		const stats = {
			inputCount: items.length,
			clusterCount: clusters.length,
			noiseCount: 0,
			dbscanEps,
			dbscanMinSamples,
			umapComponents,
			nearestCentroidThreshold,
			durationMs: Date.now() - startTime,
		};
		logger.info('bulkClusterByEmbedding.complete', stats);

		return { clusters, noiseIds: [], stats };
	}

	// 1. UMAP-project the high-dim embeddings into a small Euclidean space.
	const nNeighbors = Math.min(15, items.length - 1);
	const nComponents = Math.min(umapComponents, items.length - 2);
	const umap = new UMAP({
		nComponents,
		nNeighbors,
		minDist: 0.0,
		random: makeRng(seed),
	});
	const embedded = umap.fit(points);

	// 2. DBSCAN on the projected space.
	const dbscan = new DBSCAN();
	const rawClusters: number[][] = dbscan.run(embedded, dbscanEps, dbscanMinSamples);
	const noiseIndices: number[] = dbscan.noise;

	// 3. Build cluster groups, computing centroids on the ORIGINAL embedding
	//    space (not UMAP-projected) — downstream cosine math expects the same
	//    space the embeddings were generated in.
	const clusters: ClusterResult[] = rawClusters.map((indices) => {
		const memberIds = indices.map((i) => items[i].id);
		const memberVecs = indices.map((i) => points[i]);

		return { memberIds, centroid: meanVector(memberVecs) };
	});

	// 4. Reassign noise to nearest centroid if cosine >= threshold.
	const noiseIds: string[] = [];
	for (const noiseIdx of noiseIndices) {
		const point = points[noiseIdx];
		let bestSim = -Infinity;
		let bestCluster: ClusterResult | null = null;
		for (const cluster of clusters) {
			if (cluster.centroid.length === 0) continue;
			const sim = cosineSimilarity(point, cluster.centroid);
			if (sim > bestSim) {
				bestSim = sim;
				bestCluster = cluster;
			}
		}
		if (bestCluster && bestSim >= nearestCentroidThreshold) {
			bestCluster.memberIds.push(items[noiseIdx].id);
		} else {
			noiseIds.push(items[noiseIdx].id);
		}
	}

	// 5. Recompute centroids after noise reassignment so downstream callers
	//    (e.g. medoid selection in twoTierJudge) see the updated mean.
	for (const cluster of clusters) {
		const indicesById = new Map(items.map((it, i) => [it.id, i] as const));
		const memberVecs = cluster.memberIds.map((id) => {
			const i = indicesById.get(id);

			return i !== undefined ? points[i] : ([] as number[]);
		});
		cluster.centroid = meanVector(memberVecs);
	}

	const stats = {
		inputCount: items.length,
		clusterCount: clusters.length,
		noiseCount: noiseIds.length,
		dbscanEps,
		dbscanMinSamples,
		umapComponents,
		nearestCentroidThreshold,
		durationMs: Date.now() - startTime,
	};
	logger.info('bulkClusterByEmbedding.complete', stats);

	return { clusters, noiseIds, stats };
}

// Exported for testing and reuse by twoTierJudge (medoid selection needs
// the same cosine math).
export { cosineSimilarity, meanVector };
