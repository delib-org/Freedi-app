import {
	AttitudeMap,
	CONVERGENCE_MIN_SHARED_CAP,
	convergenceMeans,
	convergenceScore,
	opinionDistance,
} from '../utils/opinionDistance';

/** An island's four stances — the shape a civic event actually measures on. */
const [S1, S2, S3, S4] = ['stance-1', 'stance-2', 'stance-3', 'stance-4'];

function attitudes(values: [number, number, number, number]): AttitudeMap {
	return { [S1]: values[0], [S2]: values[1], [S3]: values[2], [S4]: values[3] };
}

const MIN = CONVERGENCE_MIN_SHARED_CAP;

describe('opinionDistance', () => {
	it('calls identical answers zero distance', () => {
		const a = attitudes([1, 0.5, -1, -1]);

		expect(opinionDistance(a, { ...a }, MIN).distance).toBe(0);
	});

	it('calls perfectly opposed answers full distance', () => {
		const a = attitudes([1, 1, 1, 1]);
		const b = attitudes([-1, -1, -1, -1]);

		expect(opinionDistance(a, b, MIN).distance).toBe(1);
	});

	it('withholds a number when too few stances are shared', () => {
		const a = attitudes([1, 1, 1, 1]);
		const b = { [S1]: -1, [S2]: -1 };

		const result = opinionDistance(a, b, MIN);
		expect(result.distance).toBeNull();
		expect(result.sharedStances).toBe(2);
	});

	it('measures only the stances both sides rated', () => {
		const a = attitudes([1, 1, 1, 1]);
		const b = { [S1]: 1, [S2]: 1, [S3]: 1 };

		expect(opinionDistance(a, b, MIN).sharedStances).toBe(3);
		expect(opinionDistance(a, b, MIN).distance).toBe(0);
	});
});

describe('convergenceMeans', () => {
	it('reports a room that moved closer together', () => {
		const baselines = new Map<string, AttitudeMap>([
			['ann', attitudes([1, 1, -1, -1])],
			['ben', attitudes([-1, -1, 1, 1])],
		]);
		const current = new Map<string, AttitudeMap>([
			['ann', attitudes([1, 0.5, -0.5, -1])],
			['ben', attitudes([0.5, -0.5, 0.5, 1])],
		]);

		const means = convergenceMeans({ baselines, current, minShared: MIN });

		expect(means.pairs).toBe(1);
		expect(means.participants).toBe(2);
		expect(means.before).toBeGreaterThan(means.after as number);
		expect(convergenceScore(means.before, means.after)).toBeGreaterThan(0);
	});

	it('reports a room that moved apart, rather than hiding it', () => {
		const baselines = new Map<string, AttitudeMap>([
			['ann', attitudes([1, 1, 0.5, 0.5])],
			['ben', attitudes([1, 0.5, 0.5, 1])],
		]);
		const current = new Map<string, AttitudeMap>([
			['ann', attitudes([1, 1, 1, 1])],
			['ben', attitudes([-1, -1, -1, -1])],
		]);

		const means = convergenceMeans({ baselines, current, minShared: MIN });

		expect(means.after).toBeGreaterThan(means.before as number);
		expect(convergenceScore(means.before, means.after)).toBeLessThan(0);
	});

	it('drops someone who never re-rated from BOTH means, not just one', () => {
		const ann = attitudes([1, 1, -1, -1]);
		const ben = attitudes([-1, -1, 1, 1]);
		const cal = attitudes([1, 1, 1, 1]);

		const baselines = new Map<string, AttitudeMap>([
			['ann', ann],
			['ben', ben],
			['cal', cal],
		]);
		// cal walked out — no "after" for them
		const current = new Map<string, AttitudeMap>([
			['ann', ann],
			['ben', ben],
		]);

		const means = convergenceMeans({ baselines, current, minShared: MIN });

		expect(means.participants).toBe(2);
		expect(means.pairs).toBe(1);
		// the unchanged pair must score as no movement at all
		expect(means.before).toBe(means.after);
		expect(convergenceScore(means.before, means.after)).toBe(0);
	});

	it('says nothing when no pair clears the overlap floor', () => {
		const baselines = new Map<string, AttitudeMap>([
			['ann', { [S1]: 1 }],
			['ben', { [S1]: -1 }],
		]);

		const means = convergenceMeans({ baselines, current: baselines, minShared: MIN });

		expect(means.before).toBeNull();
		expect(means.after).toBeNull();
		expect(means.pairs).toBe(0);
	});

	it('needs at least two people to have a distance at all', () => {
		const solo = new Map<string, AttitudeMap>([['ann', attitudes([1, 1, 1, 1])]]);

		expect(convergenceMeans({ baselines: solo, current: solo, minShared: MIN }).pairs).toBe(0);
	});

	it('works on a four-stance island, where the voyage-wide floor of 5 could not', () => {
		const baselines = new Map<string, AttitudeMap>([
			['ann', attitudes([1, 1, -1, -1])],
			['ben', attitudes([-1, -1, 1, 1])],
		]);

		expect(convergenceMeans({ baselines, current: baselines, minShared: MIN }).pairs).toBe(1);
		expect(convergenceMeans({ baselines, current: baselines, minShared: 5 }).pairs).toBe(0);
	});
});

describe('convergenceScore', () => {
	it('scores a room that started in agreement as no movement, not a division by zero', () => {
		expect(convergenceScore(0, 0)).toBe(0);
	});

	it('has nothing to say without both halves of the comparison', () => {
		expect(convergenceScore(null, 0.4)).toBeNull();
		expect(convergenceScore(0.4, null)).toBeNull();
	});

	it('reads as the percent of the gap that closed', () => {
		expect(convergenceScore(0.8, 0.4)).toBe(50);
		expect(convergenceScore(0.5, 0.5)).toBe(0);
	});
});
