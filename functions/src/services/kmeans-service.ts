import { logger } from 'firebase-functions';

export interface VectorWithId {
	id: string;
	vector: number[];
}

export interface KMeansCluster {
	centroid: number[];
	memberIds: string[];
}

export interface KMeansResult {
	clusters: KMeansCluster[];
	iterations: number;
	wcss: number; // within-cluster sum of squares
}

/**
 * Cosine similarity between two vectors.
 * Returns value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	normA = Math.sqrt(normA);
	normB = Math.sqrt(normB);

	if (normA === 0 || normB === 0) return 0;

	return dotProduct / (normA * normB);
}

/**
 * Cosine distance = 1 - cosine similarity. Range [0, 2].
 */
function cosineDistance(a: number[], b: number[]): number {
	return 1 - cosineSimilarity(a, b);
}

/**
 * Find the index of the nearest centroid to a vector using cosine distance.
 */
export function assignToNearestCentroid(vector: number[], centroids: number[][]): number {
	let bestIdx = 0;
	let bestDist = Infinity;

	for (let i = 0; i < centroids.length; i++) {
		const dist = cosineDistance(vector, centroids[i]);
		if (dist < bestDist) {
			bestDist = dist;
			bestIdx = i;
		}
	}

	return bestIdx;
}

/**
 * Compute the centroid (mean vector) from a list of vectors.
 */
function computeCentroid(vectors: number[][]): number[] {
	if (vectors.length === 0) return [];

	const dim = vectors[0].length;
	const centroid = new Array(dim).fill(0);

	for (const vec of vectors) {
		for (let i = 0; i < dim; i++) {
			centroid[i] += vec[i];
		}
	}

	for (let i = 0; i < dim; i++) {
		centroid[i] /= vectors.length;
	}

	return centroid;
}

/**
 * Initialize centroids using k-means++ for better convergence.
 */
function initializeCentroidsKMeansPlusPlus(
	vectors: VectorWithId[],
	k: number,
): number[][] {
	const centroids: number[][] = [];

	// Pick first centroid randomly
	const firstIdx = Math.floor(Math.random() * vectors.length);
	centroids.push([...vectors[firstIdx].vector]);

	// Pick remaining centroids weighted by distance squared
	for (let c = 1; c < k; c++) {
		const distances: number[] = vectors.map((v) => {
			let minDist = Infinity;
			for (const centroid of centroids) {
				const dist = cosineDistance(v.vector, centroid);
				if (dist < minDist) minDist = dist;
			}

			return minDist * minDist;
		});

		const totalDist = distances.reduce((sum, d) => sum + d, 0);
		if (totalDist === 0) {
			// All remaining points are on existing centroids; pick randomly
			centroids.push([...vectors[Math.floor(Math.random() * vectors.length)].vector]);
			continue;
		}

		let target = Math.random() * totalDist;
		let idx = 0;
		for (let i = 0; i < distances.length; i++) {
			target -= distances[i];
			if (target <= 0) {
				idx = i;
				break;
			}
		}
		centroids.push([...vectors[idx].vector]);
	}

	return centroids;
}

/**
 * Compute within-cluster sum of squared cosine distances (WCSS).
 */
function computeWCSS(vectors: VectorWithId[], assignments: number[], centroids: number[][]): number {
	let wcss = 0;

	for (let i = 0; i < vectors.length; i++) {
		const dist = cosineDistance(vectors[i].vector, centroids[assignments[i]]);
		wcss += dist * dist;
	}

	return wcss;
}

/**
 * K-means clustering using cosine distance with k-means++ initialization.
 *
 * @param vectors - Array of vectors with IDs
 * @param k - Number of clusters
 * @param maxIterations - Maximum iterations before stopping (default: 50)
 * @returns Clustering result with centroids, member IDs, and WCSS
 */
export function kmeans(
	vectors: VectorWithId[],
	k: number,
	maxIterations: number = 50,
): KMeansResult {
	if (vectors.length === 0) {
		return { clusters: [], iterations: 0, wcss: 0 };
	}

	// Clamp k to valid range
	k = Math.min(k, vectors.length);
	k = Math.max(k, 1);

	// Initialize centroids with k-means++
	let centroids = initializeCentroidsKMeansPlusPlus(vectors, k);
	let assignments = new Array(vectors.length).fill(0);
	let iterations = 0;

	for (let iter = 0; iter < maxIterations; iter++) {
		iterations = iter + 1;

		// Assignment step: assign each vector to nearest centroid
		const newAssignments = vectors.map((v) => assignToNearestCentroid(v.vector, centroids));

		// Check for convergence
		let changed = false;
		for (let i = 0; i < vectors.length; i++) {
			if (newAssignments[i] !== assignments[i]) {
				changed = true;
				break;
			}
		}

		assignments = newAssignments;

		if (!changed) break;

		// Update step: recompute centroids
		const clusterVectors: number[][][] = Array.from({ length: k }, () => []);
		for (let i = 0; i < vectors.length; i++) {
			clusterVectors[assignments[i]].push(vectors[i].vector);
		}

		centroids = clusterVectors.map((vecs, idx) => {
			if (vecs.length === 0) {
				// Empty cluster: keep old centroid
				return centroids[idx];
			}

			return computeCentroid(vecs);
		});
	}

	// Build result
	const clusterMembers: string[][] = Array.from({ length: k }, () => []);
	for (let i = 0; i < vectors.length; i++) {
		clusterMembers[assignments[i]].push(vectors[i].id);
	}

	const wcss = computeWCSS(vectors, assignments, centroids);

	// Filter out empty clusters
	const clusters: KMeansCluster[] = [];
	for (let i = 0; i < k; i++) {
		if (clusterMembers[i].length > 0) {
			clusters.push({
				centroid: centroids[i],
				memberIds: clusterMembers[i],
			});
		}
	}

	return { clusters, iterations, wcss };
}

/**
 * Select optimal K using the elbow method (WCSS reduction rate).
 *
 * Tests k values from kMin to kMax, picks the k where the rate of WCSS decrease
 * drops most sharply (the "elbow"). Falls back to sqrt(n/2) if no clear elbow.
 *
 * @param vectors - Array of vectors with IDs
 * @param kMin - Minimum k to test (default: 3)
 * @param kMax - Maximum k to test (default: 20)
 * @returns Optimal k value
 */
export function selectOptimalK(
	vectors: VectorWithId[],
	kMin: number = 3,
	kMax: number = 20,
): number {
	const n = vectors.length;

	if (n < kMin) return Math.max(1, n);

	// Cap kMax based on data size
	kMax = Math.min(kMax, Math.floor(n / 2));
	kMax = Math.max(kMax, kMin);

	// Default: sqrt(n/2)
	const defaultK = Math.max(kMin, Math.min(kMax, Math.ceil(Math.sqrt(n / 2))));

	if (kMax - kMin < 2) return defaultK;

	// Compute WCSS for each k
	const wcssValues: { k: number; wcss: number }[] = [];

	for (let k = kMin; k <= kMax; k++) {
		const result = kmeans(vectors, k, 20); // Fewer iterations for elbow search
		wcssValues.push({ k, wcss: result.wcss });
	}

	// Find elbow: largest drop in the rate of WCSS decrease
	if (wcssValues.length < 3) return defaultK;

	let bestElbow = defaultK;
	let maxAngle = -Infinity;

	for (let i = 1; i < wcssValues.length - 1; i++) {
		const prev = wcssValues[i - 1].wcss;
		const curr = wcssValues[i].wcss;
		const next = wcssValues[i + 1].wcss;

		// Angle metric: how much the rate of decrease changes
		const rateBefore = prev - curr;
		const rateAfter = curr - next;

		if (rateBefore === 0) continue;

		const angle = rateBefore - rateAfter;
		if (angle > maxAngle) {
			maxAngle = angle;
			bestElbow = wcssValues[i].k;
		}
	}

	logger.info('K selection complete', {
		selectedK: bestElbow,
		defaultK,
		testedRange: `${kMin}-${kMax}`,
		n,
	});

	return bestElbow;
}
