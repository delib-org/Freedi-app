import {
	assessCohesion,
	passesCohesionGate,
	centroidOf,
	synthCentroidFloor,
	type CohesionGate,
} from '../pipeline/clusterCohesion';

/**
 * Build a unit-ish 3-D vector. Using small integer components keeps the cosines
 * easy to reason about; `assessCohesion` normalizes internally.
 */
function v(x: number, y: number, z: number): number[] {
	return [x, y, z];
}

const GATE: CohesionGate = {
	centroidFloor: 0.78,
	memberFloor: 0.6,
	quorumFraction: 0.5,
};

describe('centroidOf', () => {
	it('averages equal-length vectors element-wise', () => {
		expect(centroidOf([v(1, 0, 0), v(0, 1, 0)])).toEqual([0.5, 0.5, 0]);
	});

	it('ignores empty and mismatched-length vectors', () => {
		expect(centroidOf([v(2, 0, 0), [], v(0, 2, 0)])).toEqual([1, 1, 0]);
		expect(centroidOf([])).toEqual([]);
	});
});

describe('assessCohesion', () => {
	it('reports high centroid + full quorum for an option close to all members', () => {
		const members = [v(1, 0, 0), v(0.9, 0.1, 0), v(0.95, 0.05, 0)];
		const option = v(1, 0.02, 0);
		const a = assessCohesion(members, option, GATE.memberFloor);
		expect(a.memberCount).toBe(3);
		expect(a.centroidCosine).toBeGreaterThan(0.95);
		expect(a.fractionAboveFloor).toBe(1);
	});

	it('reports low centroid + low quorum for an outlier near only one member', () => {
		// One member shares the option's direction; the rest are orthogonal-ish.
		const members = [v(1, 0, 0), v(0, 1, 0), v(0, 1, 0.1), v(0, 0.9, 0)];
		const option = v(1, 0.05, 0); // ~parallel to member 0 only
		const a = assessCohesion(members, option, GATE.memberFloor);
		expect(a.fractionAboveFloor).toBeLessThan(0.5);
		expect(a.centroidCosine).toBeLessThan(0.78);
	});

	it('fails open with no usable member embeddings', () => {
		const a = assessCohesion([], v(1, 0, 0), GATE.memberFloor);
		expect(a).toEqual({ memberCount: 0, centroidCosine: 0, fractionAboveFloor: 0 });
	});
});

describe('passesCohesionGate', () => {
	it('passes a cohesive newcomer (centroid + quorum both clear)', () => {
		const members = [v(1, 0, 0), v(0.9, 0.1, 0), v(0.95, 0.05, 0)];
		const a = assessCohesion(members, v(1, 0.02, 0), GATE.memberFloor);
		expect(passesCohesionGate(a, GATE)).toBe(true);
	});

	it('rejects a single-member outlier (the snowball case)', () => {
		const members = [v(1, 0, 0), v(0, 1, 0), v(0, 1, 0.1), v(0, 0.9, 0)];
		const a = assessCohesion(members, v(1, 0.05, 0), GATE.memberFloor);
		expect(passesCohesionGate(a, GATE)).toBe(false);
	});

	it('rejects on a thin quorum even when the centroid signal is strong', () => {
		// Two members, option sitting right between them: centroid cosine high,
		// per-member cosines moderate. Both signals are now required.
		//
		// This gate used to pass on EITHER signal, which made it inert in practice:
		// with the per-member floor at `clusterThreshold`, and 80% of measured
		// cross-topic pairs clearing that floor, the quorum arm passed
		// unconditionally and carried the whole gate. Zero rejections in a
		// 100-statement run, while a synth quietly merged compost collection with
		// recycling pickup.
		const members = [v(1, 0.5, 0), v(1, -0.5, 0)];
		const option = v(1, 0, 0);
		const a = assessCohesion(members, option, 0.95); // deliberately strict member floor
		expect(a.fractionAboveFloor).toBeLessThan(0.5);
		expect(a.centroidCosine).toBeGreaterThanOrEqual(GATE.centroidFloor);
		expect(passesCohesionGate(a, { ...GATE, memberFloor: 0.95 })).toBe(false);
	});

	it('fails open (passes) when there are no member embeddings', () => {
		const a = assessCohesion([], v(1, 0, 0), GATE.memberFloor);
		expect(passesCohesionGate(a, GATE)).toBe(true);
	});
});

describe('synthCentroidFloor', () => {
	it('lands halfway up the synth band', () => {
		// Shipped defaults: synthLowerBound 0.78, attachThreshold 0.85 → 0.815.
		// Measured on the accuracy corpus, that keeps all 50 genuine paraphrase
		// attaches (within-pair min 0.824) while admitting 9 of 4900 false ones;
		// at 0.78 it would admit 63.
		expect(synthCentroidFloor(0.78, 0.85)).toBeCloseTo(0.815, 5);
	});

	it('tracks retuned bands rather than pinning a constant', () => {
		expect(synthCentroidFloor(0.84, 0.9)).toBeCloseTo(0.87, 5);
	});
});
