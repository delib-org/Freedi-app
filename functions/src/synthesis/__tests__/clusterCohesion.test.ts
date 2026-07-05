import {
	assessCohesion,
	passesCohesionGate,
	centroidOf,
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

	it('passes on the centroid signal alone even if quorum is thin', () => {
		// Two members, option sits right between them: centroid cosine high,
		// per-member cosines moderate.
		const members = [v(1, 0.5, 0), v(1, -0.5, 0)];
		const option = v(1, 0, 0);
		const a = assessCohesion(members, option, 0.95); // deliberately strict member floor
		expect(a.fractionAboveFloor).toBeLessThan(0.5);
		expect(passesCohesionGate(a, { ...GATE, memberFloor: 0.95 })).toBe(true);
	});

	it('fails open (passes) when there are no member embeddings', () => {
		const a = assessCohesion([], v(1, 0, 0), GATE.memberFloor);
		expect(passesCohesionGate(a, GATE)).toBe(true);
	});
});
