/**
 * HDBSCAN library spike — runs density-clustering DBSCAN on synthetic
 * 5-d Gaussian blobs to verify the library works for our use case.
 *
 * Run: npx tsx functions/src/services/topic-cluster/__tests__/spike.ts
 */

import clustering from 'density-clustering';
import { UMAP } from 'umap-js';

type Point = number[];

function gaussianBlob(center: Point, sigma: number, count: number, seed: number): Point[] {
	let s = seed;
	const rand = () => {
		s = (s * 9301 + 49297) % 233280;

		return s / 233280;
	};
	const gauss = () => {
		let u = 0;
		let v = 0;
		while (u === 0) u = rand();
		while (v === 0) v = rand();

		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	};
	const out: Point[] = [];
	for (let i = 0; i < count; i++) {
		out.push(center.map((c) => c + gauss() * sigma));
	}

	return out;
}

function main(): void {
	console.info('--- HDBSCAN/DBSCAN spike ---');

	// Three blobs in 5-d, well-separated
	const blob1 = gaussianBlob([0, 0, 0, 0, 0], 0.5, 17, 42);
	const blob2 = gaussianBlob([5, 0, 0, 0, 0], 0.5, 17, 100);
	const blob3 = gaussianBlob([-5, 0, 0, 0, 0], 0.5, 16, 200);

	const truth: number[] = [
		...new Array(17).fill(0),
		...new Array(17).fill(1),
		...new Array(16).fill(2),
	];
	const points = [...blob1, ...blob2, ...blob3];
	console.info(`Generated ${points.length} points across 3 blobs in 5-d`);

	// 1. UMAP project to 2-d (matches pipeline shape — UMAP then DBSCAN)
	let rngState = 42;
	const seededRandom = (): number => {
		rngState = (rngState * 9301 + 49297) % 233280;

		return rngState / 233280;
	};
	const umap = new UMAP({
		nComponents: 2,
		nNeighbors: 14,
		minDist: 0.1,
		random: seededRandom,
	});
	const embedded = umap.fit(points);
	console.info(`UMAP projected to ${embedded[0].length}-d`);

	// 2. Run DBSCAN
	const dbscan = new clustering.DBSCAN();
	const clusters: number[][] = dbscan.run(embedded, 1.5, 3);
	const noise: number[] = dbscan.noise;
	console.info(`DBSCAN: ${clusters.length} clusters, ${noise.length} noise points`);

	// 3. Verify each cluster is dominantly one true blob
	const truthCounts = clusters.map((cluster) => {
		const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
		for (const idx of cluster) counts[truth[idx]]++;

		return counts;
	});
	console.info('Cluster->truth distribution:', JSON.stringify(truthCounts));

	const allValid = truthCounts.every((counts) => {
		const total = counts[0] + counts[1] + counts[2];
		const max = Math.max(counts[0], counts[1], counts[2]);

		return max / total >= 0.8;
	});

	if (clusters.length < 3 || clusters.length > 4 || !allValid) {
		console.error(
			`FAIL: expected 3-4 clusters with ≥80% purity, got ${clusters.length} clusters; purity=${allValid}`,
		);
		process.exit(1);
	}

	console.info('PASS: density-clustering DBSCAN works for our pipeline');
}

main();
