import { parse } from 'valibot';
import {
	addDist,
	agoraRatingBucket,
	calcAgoraClassConsensus,
	consensusCeiling,
	distMoments,
	eligiblePoolFor,
	emptyDist,
	normalizedConsensus,
} from '../models/agora/agoraConsensus';
import {
	AgoraCampAggregateSchema,
	AgoraProposalScoreSchema,
	type AgoraCampAggregate,
	type AgoraRatingDist,
} from '../models/agora/agoraScore';
import { calcAgreement } from '../utils/consensusCalculation';
import type { AgoraCamp } from '../models/agora/agoraEnums';

const NO_ONE = { left: 0, right: 0, center: 0 };

function camp(studentDist?: AgoraRatingDist): AgoraCampAggregate {
	const moments = distMoments(studentDist);

	return {
		sum: moments.sum,
		n: moments.n,
		positiveN: (studentDist?.[3] ?? 0) + (studentDist?.[4] ?? 0),
		studentDist,
	};
}

/** All raters in one camp, so the class view is just that histogram */
function classOf(studentDist: AgoraRatingDist, eligible: number) {
	return calcAgoraClassConsensus({
		perCamp: { left: camp(studentDist), right: camp(), center: camp() },
		eligible: { ...NO_ONE, left: eligible },
	});
}

describe('agoraRatingBucket', () => {
	it('maps each rating level to its own bucket', () => {
		expect(agoraRatingBucket(-1)).toBe(0);
		expect(agoraRatingBucket(-0.5)).toBe(1);
		expect(agoraRatingBucket(0)).toBe(2);
		expect(agoraRatingBucket(0.5)).toBe(3);
		expect(agoraRatingBucket(1)).toBe(4);
	});

	it('snaps off-grid values to the nearest level', () => {
		// The security rules only require a number, so nothing stops a client
		// writing 0.37. Snapping keeps the sum-of-counts invariant intact.
		expect(agoraRatingBucket(0.37)).toBe(3);
		expect(agoraRatingBucket(-0.9)).toBe(0);
		expect(agoraRatingBucket(0.1)).toBe(2);
	});

	it('clamps out-of-range values instead of throwing inside a trigger', () => {
		expect(agoraRatingBucket(5)).toBe(4);
		expect(agoraRatingBucket(-5)).toBe(0);
	});

	it('treats a non-finite value as neutral, not as a strong opinion', () => {
		// Infinity is corrupt data, not enthusiasm. Bucketing it as +1 would let
		// one bad write drag a proposal's score up; neutral moves it nowhere.
		expect(agoraRatingBucket(NaN)).toBe(2);
		expect(agoraRatingBucket(Infinity)).toBe(2);
		expect(agoraRatingBucket(-Infinity)).toBe(2);
	});
});

describe('distMoments', () => {
	it('is exact — no floating point drift', () => {
		// Two at -1, one at -0.5, three at +0.5, four at +1
		const moments = distMoments([2, 1, 0, 3, 4]);
		expect(moments.n).toBe(10);
		expect(moments.sum).toBe(-2 - 0.5 + 1.5 + 4);
		expect(moments.sum).toBe(3);
		// squares: 2(1) + 1(0.25) + 3(0.25) + 4(1)
		expect(moments.sumSquares).toBe(7);
	});

	it('returns zeroes for a legacy aggregate with no histogram', () => {
		expect(distMoments(undefined)).toEqual({ n: 0, sum: 0, sumSquares: 0 });
	});

	it('clamps negative counts left by a replayed delta', () => {
		// A double-applied decrement is the one corruption a histogram can
		// actually notice; a bare sum-of-squares would absorb it silently.
		expect(distMoments([-3, 0, 0, 0, 2])).toEqual({ n: 2, sum: 2, sumSquares: 2 });
	});

	it('addDist folds camps without touching the originals', () => {
		const a: AgoraRatingDist = [1, 0, 0, 0, 2];
		const b: AgoraRatingDist = [0, 3, 0, 1, 0];
		expect(addDist(a, b)).toEqual([1, 3, 0, 1, 2]);
		expect(a).toEqual([1, 0, 0, 0, 2]);
	});
});

describe('calcAgoraClassConsensus', () => {
	it('gives a unanimous class exactly 1 — the bug this exists to fix', () => {
		// Class of six: five peers can rate (the author never rates their own),
		// and all five said +1. There is nobody left to be uncertain about.
		const result = classOf([0, 0, 0, 0, 5], 5);
		expect(result?.consensus).toBe(1);
		expect(result?.coverage).toBe(1);
		expect(result?.mean).toBe(1);
	});

	it('scores that same class at 0.33 when the population is unknown', () => {
		// The old behaviour, kept as a witness: without N the formula hedges
		// against classmates who do not exist.
		expect(calcAgreement(5, 5, 5)).toBeCloseTo(0.3296, 4);
	});

	it('reports the true mean when a full class disagrees', () => {
		// Three for, one neutral, one against. Mean is 0.4 and every eligible
		// student voted, so 0.4 is the answer — not a hedge below it.
		const result = classOf([1, 0, 1, 0, 3], 5);
		expect(result?.mean).toBeCloseTo(0.4, 10);
		expect(result?.consensus).toBeCloseTo(0.4, 10);
	});

	it('still hedges while most of the class has not rated', () => {
		const result = classOf([0, 0, 0, 0, 3], 29);
		expect(result?.consensus).toBeLessThan(0.3);
		expect(result?.coverage).toBeCloseTo(3 / 29, 5);
	});

	it('returns undefined for a legacy doc with no histogram anywhere', () => {
		// Must not throw and must not read as zero consensus.
		const result = calcAgoraClassConsensus({
			perCamp: { left: camp(), right: camp(), center: camp() },
			eligible: { left: 2, right: 2, center: 1 },
		});
		expect(result).toBeUndefined();
	});

	it('combines the three camps into one class view', () => {
		const result = calcAgoraClassConsensus({
			perCamp: {
				left: camp([0, 0, 0, 0, 2]),
				right: camp([1, 0, 0, 0, 0]),
				center: camp([0, 0, 1, 0, 0]),
			},
			eligible: { left: 2, right: 1, center: 1 },
		});
		expect(result?.n).toBe(4);
		expect(result?.mean).toBeCloseTo((2 - 1) / 4, 10);
	});

	it('never trusts a pool smaller than the raters who turned up', () => {
		// Stale census data must not be read as a census, which would zero the
		// penalty and hand out a perfect score.
		const stale = classOf([0, 0, 0, 0, 10], 3);
		const honest = classOf([0, 0, 0, 0, 10], 10);
		expect(stale?.consensus).toBe(honest?.consensus);
		expect(stale?.eligible).toBe(10);
	});

	it('keeps polarization free of the population correction', () => {
		// How divided a class is cannot depend on how many of them we heard.
		const partial = classOf([0, 0, 0, 0, 5], 29);
		const census = classOf([0, 0, 0, 0, 5], 5);
		expect(census?.polarization).toBeCloseTo(partial?.polarization ?? -1, 10);
	});
});

describe('normalizedConsensus - comparing classes of different sizes', () => {
	it('is 1 when a proposal reached the best its class could reach', () => {
		expect(normalizedConsensus(consensusCeiling(15, 29), 15, 29)).toBe(1);
	});

	it('is 0 for a class that does not back the proposal', () => {
		expect(normalizedConsensus(-0.3, 15, 29)).toBe(0);
	});

	it('collapses the class-size penalty that raw consensus carries', () => {
		// Same sentiment (80% at +1, 20% neutral), two very different classes,
		// each rating as much as its fixed budget allows. Raw consensus punishes
		// the big class for being big; normalized does not.
		const BUDGET = 15;
		const measure = (classSize: number) => {
			const peers = classSize - 1;
			const raters = Math.min(BUDGET, peers);
			const positive = Math.round(raters * 0.8);
			const dist: AgoraRatingDist = [0, 0, raters - positive, 0, positive];
			const result = classOf(dist, peers);

			return { raw: result?.consensus ?? 0, normalized: result?.normalized ?? 0 };
		};

		const small = measure(6);
		const large = measure(40);

		// The bug: raw consensus drops sharply purely because the class is bigger
		expect(small.raw - large.raw).toBeGreaterThan(0.2);
		// The fix: normalized stays comparable across both
		expect(Math.abs(small.normalized - large.normalized)).toBeLessThan(0.1);
	});
});

describe('schema compatibility with existing sessions', () => {
	it('accepts a camp aggregate with no histogram', () => {
		// If this ever fails, every proposal written before this feature
		// disappears from the students' square mid-lesson.
		expect(() => parse(AgoraCampAggregateSchema, { sum: 0, n: 0, positiveN: 0 })).not.toThrow();
	});

	it('accepts a legacy score doc untouched', () => {
		const legacy = {
			statementId: 'proposal-1',
			sessionId: 'session-1',
			authorCamp: 'left',
			perCamp: {
				left: { sum: 1, n: 1, positiveN: 1 },
				right: { sum: 0, n: 0, positiveN: 0 },
				center: { sum: 0, n: 0, positiveN: 0 },
			},
			bridgingScore: 35,
			lastUpdate: 1_700_000_000_000,
		};
		expect(() => parse(AgoraProposalScoreSchema, legacy)).not.toThrow();
	});

	it('accepts a doc carrying the new fields', () => {
		const modern = {
			statementId: 'proposal-2',
			sessionId: 'session-1',
			authorCamp: 'center',
			perCamp: {
				left: { sum: 2, n: 2, positiveN: 2, studentDist: emptyDist() },
				right: { sum: 0, n: 0, positiveN: 0, studentDist: emptyDist() },
				center: { sum: 0, n: 0, positiveN: 0, studentDist: emptyDist() },
			},
			bridgingScore: 60,
			authorPositioned: true,
			classConsensus: {
				consensus: 1,
				mean: 1,
				n: 5,
				eligible: 5,
				coverage: 1,
				normalized: 1,
				polarization: 0.2,
			},
			lastUpdate: 1_700_000_000_000,
		};
		expect(() => parse(AgoraProposalScoreSchema, modern)).not.toThrow();
	});
});

describe('eligiblePoolFor', () => {
	const CLASS = { left: 4, right: 3, center: 2 };

	it('removes the author from their own camp', () => {
		// The square never serves anyone their own text, so counting the author
		// would leave a fully-participating class permanently one rating short
		// of a census — and recognising a census is the whole point.
		expect(
			eligiblePoolFor({ authorCamp: 'left' as AgoraCamp, authorPositioned: true }, CLASS),
		).toEqual({ left: 3, right: 3, center: 2 });
	});

	it('removes nobody when the author never positioned', () => {
		expect(
			eligiblePoolFor({ authorCamp: 'left' as AgoraCamp, authorPositioned: false }, CLASS),
		).toEqual(CLASS);
	});

	it('treats a legacy score doc as unpositioned', () => {
		// authorPositioned is absent on docs written before it existed. Reading
		// it as false makes the pool one seat too large, which understates the
		// consensus — the safe direction, since too small an N inflates it.
		expect(eligiblePoolFor({ authorCamp: 'right' as AgoraCamp }, CLASS)).toEqual(CLASS);
	});

	it('never drives a camp below zero', () => {
		expect(
			eligiblePoolFor(
				{ authorCamp: 'center' as AgoraCamp, authorPositioned: true },
				{ left: 1, right: 1, center: 0 },
			),
		).toEqual({ left: 1, right: 1, center: 0 });
	});

	it('leaves the other camps untouched', () => {
		const result = eligiblePoolFor(
			{ authorCamp: 'center' as AgoraCamp, authorPositioned: true },
			CLASS,
		);
		expect(result.left).toBe(CLASS.left);
		expect(result.right).toBe(CLASS.right);
		expect(result.center).toBe(CLASS.center - 1);
	});
});
