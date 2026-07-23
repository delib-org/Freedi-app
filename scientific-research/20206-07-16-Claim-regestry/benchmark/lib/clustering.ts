/** Average-linkage agglomerative clustering over a cosine-similarity matrix. */

export function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function similarityMatrix(vectors: number[][]): number[][] {
	const n = vectors.length;
	const sim: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
	for (let i = 0; i < n; i++) {
		for (let j = i; j < n; j++) {
			const s = i === j ? 1 : cosine(vectors[i], vectors[j]);
			sim[i][j] = s;
			sim[j][i] = s;
		}
	}

	return sim;
}

/**
 * Merges the pair of clusters with the highest average cross-cluster
 * similarity as long as it's >= threshold; stops when no remaining pair
 * qualifies. O(n^3) worst case — fine for the ~100-claim codebooks here.
 */
export function clusterBySimilarity(sim: number[][], threshold: number): number[][] {
	let clusters: number[][] = sim.map((_, i) => [i]);

	const avgSim = (a: number[], b: number[]): number => {
		let total = 0;
		for (const i of a) for (const j of b) total += sim[i][j];

		return total / (a.length * b.length);
	};

	while (clusters.length > 1) {
		let bestI = -1;
		let bestJ = -1;
		let bestScore = -Infinity;
		for (let i = 0; i < clusters.length; i++) {
			for (let j = i + 1; j < clusters.length; j++) {
				const score = avgSim(clusters[i], clusters[j]);
				if (score > bestScore) {
					bestScore = score;
					bestI = i;
					bestJ = j;
				}
			}
		}
		if (bestScore < threshold) break;
		const merged = [...clusters[bestI], ...clusters[bestJ]];
		clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
		clusters.push(merged);
	}

	return clusters;
}
