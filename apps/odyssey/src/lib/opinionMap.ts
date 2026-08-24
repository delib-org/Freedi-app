import type { Evaluation, OdysseyElder, OdysseyParty } from '@freedi/shared-types';
import type { IslandContent } from './game';
import {
	AttitudeMap,
	MIN_SHARED_STANCES,
	elderAttitudes,
	opinionDistance,
	participantProfiles,
	partyAttitudes,
} from './distance';

/**
 * =========================  2D OPINION MAP  ============================
 * Classical MDS (Torgerson), implementing §3 of
 * `apps/agora/docs/opinion-distance-and-map.md`: given the pairwise
 * opinion-distance matrix (players + parties as virtual users), find 2D
 * positions whose straight-line distances best reproduce it.
 *
 * Honesty requirements from the doc, honored here:
 * - Fidelity metrics (Pearson r, Kruskal stress-1, variance carried by the
 *   two axes) are always computed and returned; `reliable` is false when
 *   r < ~0.8 — the UI must then warn or hide the map.
 * - Axes are unitless and orientation is arbitrary — the renderer must use
 *   equal scale on both axes and a scale bar, never labeled directions.
 *   Axis signs are fixed deterministically so reloads don't flip the map.
 *
 * Pairs below the min-overlap rule have no trustworthy distance; they are
 * imputed with the mean known distance for the embedding, but fidelity is
 * measured on the known pairs only, so heavy imputation degrades r and the
 * map hides itself.
 * =======================================================================
 */

export type OpinionPointKind = 'me' | 'sailor' | 'party' | 'elder';

export interface OpinionPoint {
	id: string;
	kind: OpinionPointKind;
	label: string;
	color?: string;
	x: number;
	y: number;
}

export interface OpinionMapFidelity {
	/** Pearson correlation between true and drawn distances (known pairs) */
	r: number;
	/** Kruskal stress-1 over known pairs */
	stress: number;
	/** (λ₁+λ₂) / Σ positive λ — structure carried by the two axes */
	varianceRatio: number;
}

export interface OpinionMapResult {
	points: OpinionPoint[];
	fidelity: OpinionMapFidelity;
	/** Doc: if r < ~0.8 the map is misleading — warn or don't show. */
	reliable: boolean;
	/** Share of pairs whose distance was real (not imputed). */
	knownPairRatio: number;
}

const RELIABLE_R = 0.8;

interface MapEntity {
	id: string;
	kind: OpinionPointKind;
	label: string;
	color?: string;
	attitudes: AttitudeMap;
}

export function buildOpinionMap(input: {
	uid: string;
	evaluations: Evaluation[];
	islands: IslandContent[];
	parties: OdysseyParty[];
	/** Elder personas as further virtual users (labeled AI, like party ships). */
	elders?: OdysseyElder[];
	/** Overlap threshold for a pair distance to count as known. */
	minSharedStances?: number;
}): OpinionMapResult | null {
	const { uid, evaluations, islands, parties, elders = [] } = input;
	const minShared = input.minSharedStances ?? MIN_SHARED_STANCES;

	const entities: MapEntity[] = [];
	for (const profile of participantProfiles(evaluations).values()) {
		entities.push({
			id: profile.userId,
			kind: profile.userId === uid ? 'me' : 'sailor',
			label: profile.userId === uid ? 'אתם' : profile.displayName,
			attitudes: profile.attitudes,
		});
	}
	for (const party of parties) {
		const attitudes = partyAttitudes(party, islands);
		if (Object.keys(attitudes).length === 0) continue;
		entities.push({
			id: `party--${party.partyId}`,
			kind: 'party',
			label: party.name,
			color: party.color,
			attitudes,
		});
	}
	for (const elder of elders) {
		const attitudes = elderAttitudes(elder, islands);
		if (Object.keys(attitudes).length === 0) continue;
		entities.push({
			id: `elder--${elder.elderId}`,
			kind: 'elder',
			label: elder.name,
			color: elder.color,
			attitudes,
		});
	}

	const n = entities.length;
	if (n < 3) return null;

	// Pairwise distance matrix + known mask (min-overlap rule).
	const distances: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
	const known: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
	let knownSum = 0;
	let knownCount = 0;
	let pairCount = 0;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			pairCount += 1;
			const { distance } = opinionDistance(entities[i].attitudes, entities[j].attitudes, minShared);
			if (distance !== null) {
				distances[i][j] = distances[j][i] = distance;
				known[i][j] = known[j][i] = true;
				knownSum += distance;
				knownCount += 1;
			}
		}
	}
	if (knownCount === 0) return null;

	const meanKnown = knownSum / knownCount;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (!known[i][j]) {
				distances[i][j] = distances[j][i] = meanKnown;
			}
		}
	}

	const { coords, varianceRatio } = classicalMds(distances);

	// Fidelity on known pairs only.
	const trueDistances: number[] = [];
	const drawnDistances: number[] = [];
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (!known[i][j]) continue;
			trueDistances.push(distances[i][j]);
			drawnDistances.push(euclidean(coords[i], coords[j]));
		}
	}
	const r = pearson(trueDistances, drawnDistances);
	const stress = kruskalStress(trueDistances, drawnDistances);

	return {
		points: entities.map((entity, index) => ({
			id: entity.id,
			kind: entity.kind,
			label: entity.label,
			color: entity.color,
			x: coords[index][0],
			y: coords[index][1],
		})),
		fidelity: { r, stress, varianceRatio },
		reliable: r >= RELIABLE_R,
		knownPairRatio: knownCount / pairCount,
	};
}

function euclidean(a: [number, number], b: [number, number]): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pearson(a: number[], b: number[]): number {
	const n = a.length;
	if (n < 2) return 1;
	const meanA = a.reduce((sum, value) => sum + value, 0) / n;
	const meanB = b.reduce((sum, value) => sum + value, 0) / n;
	let cov = 0;
	let varA = 0;
	let varB = 0;
	for (let i = 0; i < n; i++) {
		cov += (a[i] - meanA) * (b[i] - meanB);
		varA += (a[i] - meanA) ** 2;
		varB += (b[i] - meanB) ** 2;
	}
	if (varA === 0 || varB === 0) return 1;

	return cov / Math.sqrt(varA * varB);
}

/** Kruskal stress-1: √( Σ(d − d̂)² / Σd² ) */
function kruskalStress(trueDistances: number[], drawnDistances: number[]): number {
	let numerator = 0;
	let denominator = 0;
	for (let i = 0; i < trueDistances.length; i++) {
		numerator += (trueDistances[i] - drawnDistances[i]) ** 2;
		denominator += trueDistances[i] ** 2;
	}
	if (denominator === 0) return 0;

	return Math.sqrt(numerator / denominator);
}

/**
 * Torgerson classical MDS:
 *   B = −½ · J · D² · J   (double-centered Gram matrix)
 *   X = top-2 eigenvectors of B, each scaled by √eigenvalue
 */
function classicalMds(distanceMatrix: number[][]): {
	coords: [number, number][];
	varianceRatio: number;
} {
	const n = distanceMatrix.length;
	const squared = distanceMatrix.map((row) => row.map((value) => value * value));
	const rowMeans = squared.map((row) => row.reduce((sum, value) => sum + value, 0) / n);
	const grandMean = rowMeans.reduce((sum, value) => sum + value, 0) / n;

	const gram: number[][] = Array.from({ length: n }, (_, i) =>
		Array.from(
			{ length: n },
			(_, j) => -0.5 * (squared[i][j] - rowMeans[i] - rowMeans[j] + grandMean),
		),
	);

	const { values, vectors } = jacobiEigen(gram);
	const order = values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);

	const positiveSum = order.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);
	const axes: number[][] = [];
	let topTwoSum = 0;
	for (let axis = 0; axis < 2; axis++) {
		const entry = order[axis];
		const eigenvalue = entry && entry.value > 0 ? entry.value : 0;
		topTwoSum += eigenvalue;
		const scale = Math.sqrt(eigenvalue);
		const column = vectors.map((row) => row[entry?.index ?? 0] * scale);
		axes.push(eigenvalue > 0 ? column : new Array<number>(n).fill(0));
	}

	// Deterministic orientation: flip each axis so its largest-|coordinate|
	// point sits on the positive side — reloads don't mirror the map.
	for (const axis of axes) {
		let maxAbs = 0;
		let sign = 1;
		for (const value of axis) {
			if (Math.abs(value) > maxAbs) {
				maxAbs = Math.abs(value);
				sign = value >= 0 ? 1 : -1;
			}
		}
		if (sign < 0) {
			for (let i = 0; i < axis.length; i++) axis[i] = -axis[i];
		}
	}

	return {
		coords: Array.from({ length: n }, (_, i) => [axes[0][i], axes[1][i]]),
		varianceRatio: positiveSum > 0 ? topTwoSum / positiveSum : 0,
	};
}

/**
 * Cyclic Jacobi eigendecomposition for a symmetric matrix.
 * Returns eigenvalues and an orthogonal matrix whose COLUMNS are the
 * corresponding eigenvectors (vectors[row][column]). Map-sized inputs
 * (tens of points) converge in a handful of sweeps.
 */
function jacobiEigen(symmetric: number[][]): { values: number[]; vectors: number[][] } {
	const n = symmetric.length;
	const a = symmetric.map((row) => [...row]);
	const vectors: number[][] = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	);

	const MAX_SWEEPS = 50;
	for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
		let offDiagonal = 0;
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) offDiagonal += a[i][j] * a[i][j];
		}
		if (offDiagonal < 1e-12) break;

		for (let p = 0; p < n; p++) {
			for (let q = p + 1; q < n; q++) {
				if (Math.abs(a[p][q]) < 1e-15) continue;
				const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
				const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
				const c = 1 / Math.sqrt(t * t + 1);
				const s = t * c;

				for (let k = 0; k < n; k++) {
					const akp = a[k][p];
					const akq = a[k][q];
					a[k][p] = c * akp - s * akq;
					a[k][q] = s * akp + c * akq;
				}
				for (let k = 0; k < n; k++) {
					const apk = a[p][k];
					const aqk = a[q][k];
					a[p][k] = c * apk - s * aqk;
					a[q][k] = s * apk + c * aqk;
				}
				for (let k = 0; k < n; k++) {
					const vkp = vectors[k][p];
					const vkq = vectors[k][q];
					vectors[k][p] = c * vkp - s * vkq;
					vectors[k][q] = s * vkp + c * vkq;
				}
			}
		}
	}

	return { values: a.map((row, i) => row[i]), vectors };
}
