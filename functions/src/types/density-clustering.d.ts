declare module 'density-clustering' {
	export class DBSCAN {
		noise: number[];
		run(
			dataset: number[][],
			epsilon: number,
			minPts: number,
			distanceFunction?: (a: number[], b: number[]) => number,
		): number[][];
	}
	export class OPTICS {
		run(
			dataset: number[][],
			epsilon: number,
			minPts: number,
			distanceFunction?: (a: number[], b: number[]) => number,
		): number[][];
		getReachabilityPlot(): number[];
	}
	export class KMEANS {
		run(dataset: number[][], k: number): number[][];
	}
	const _default: { DBSCAN: typeof DBSCAN; OPTICS: typeof OPTICS; KMEANS: typeof KMEANS };
	export default _default;
}
