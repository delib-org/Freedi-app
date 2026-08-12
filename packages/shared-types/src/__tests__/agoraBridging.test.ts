import {
	deriveCamp,
	calcBridgingScore,
	bridgingTierFor,
	bridgingPayout,
	BridgingInput,
} from '../models/agora/agoraBridging';
import { AgoraCamp } from '../models/agora/agoraEnums';
import {
	AGORA_BRIDGING,
	AGORA_CAMP_BOUNDS,
	AGORA_POINTS,
} from '../models/agora/agoraConstants';
import type { AgoraCampAggregate } from '../models/agora/agoraScore';

const empty: AgoraCampAggregate = { sum: 0, n: 0, positiveN: 0 };

function input(
	authorCamp: AgoraCamp,
	perCamp: Partial<BridgingInput['perCamp']>
): BridgingInput {
	return {
		authorCamp,
		perCamp: {
			left: perCamp.left ?? empty,
			right: perCamp.right ?? empty,
			center: perCamp.center ?? empty,
		},
	};
}

describe('deriveCamp', () => {
	it('maps low positions to left camp', () => {
		expect(deriveCamp(0)).toBe(AgoraCamp.left);
		expect(deriveCamp(AGORA_CAMP_BOUNDS.LEFT_MAX)).toBe(AgoraCamp.left);
	});

	it('maps high positions to right camp', () => {
		expect(deriveCamp(100)).toBe(AgoraCamp.right);
		expect(deriveCamp(AGORA_CAMP_BOUNDS.RIGHT_MIN)).toBe(AgoraCamp.right);
	});

	it('maps middle positions to center camp', () => {
		expect(deriveCamp(50)).toBe(AgoraCamp.center);
		expect(deriveCamp(AGORA_CAMP_BOUNDS.LEFT_MAX + 1)).toBe(AgoraCamp.center);
		expect(deriveCamp(AGORA_CAMP_BOUNDS.RIGHT_MIN - 1)).toBe(AgoraCamp.center);
	});
});

describe('calcBridgingScore', () => {
	it('returns 0 with no evaluations', () => {
		expect(calcBridgingScore(input(AgoraCamp.left, {}))).toBe(0);
	});

	it('weights cross-camp support above same-camp support', () => {
		const fullSupport: AgoraCampAggregate = {
			sum: AGORA_BRIDGING.MIN_CROSS_RATERS,
			n: AGORA_BRIDGING.MIN_CROSS_RATERS,
			positiveN: AGORA_BRIDGING.MIN_CROSS_RATERS,
		};
		const sameOnly = calcBridgingScore(
			input(AgoraCamp.left, { left: fullSupport })
		);
		const crossOnly = calcBridgingScore(
			input(AgoraCamp.left, { right: fullSupport })
		);
		expect(crossOnly).toBeGreaterThan(sameOnly);
		expect(sameOnly).toBe(Math.round(100 * AGORA_BRIDGING.SAME_CAMP_WEIGHT));
		expect(crossOnly).toBe(Math.round(100 * AGORA_BRIDGING.CROSS_CAMP_WEIGHT));
	});

	it('ramps cross-camp confidence with the number of cross raters', () => {
		const oneCross = calcBridgingScore(
			input(AgoraCamp.left, { right: { sum: 1, n: 1, positiveN: 1 } })
		);
		const threeCross = calcBridgingScore(
			input(AgoraCamp.left, { right: { sum: 3, n: 3, positiveN: 3 } })
		);
		expect(threeCross).toBeGreaterThan(oneCross);
	});

	it('scores full support from both camps at 100', () => {
		const fullSupport: AgoraCampAggregate = { sum: 5, n: 5, positiveN: 5 };
		const score = calcBridgingScore(
			input(AgoraCamp.left, { left: fullSupport, right: fullSupport })
		);
		expect(score).toBe(100);
	});

	it('floors a unanimously, maximally opposed class at zero', () => {
		const opposed: AgoraCampAggregate = { sum: -4, n: 4, positiveN: 0 };
		expect(
			calcBridgingScore(input(AgoraCamp.left, { left: opposed, right: opposed }))
		).toBe(0);
	});

	it('never goes negative, whatever the arithmetic', () => {
		const opposed: AgoraCampAggregate = { sum: -4, n: 4, positiveN: 0 };
		const enthusiastic: AgoraCampAggregate = { sum: 4, n: 4, positiveN: 4 };
		expect(
			calcBridgingScore(input(AgoraCamp.left, { left: enthusiastic, right: opposed }))
		).toBeGreaterThanOrEqual(0);
	});

	it('counts center raters toward both camps at half weight', () => {
		const centerSupport = calcBridgingScore(
			input(AgoraCamp.left, { center: { sum: 4, n: 4, positiveN: 4 } })
		);
		expect(centerSupport).toBeGreaterThan(0);
		expect(centerSupport).toBeLessThan(100);
	});

	it('treats a center-camp author symmetrically over both wings', () => {
		const score = calcBridgingScore(
			input(AgoraCamp.center, {
				left: { sum: 2, n: 2, positiveN: 2 },
				right: { sum: 2, n: 2, positiveN: 2 },
				center: { sum: 1, n: 1, positiveN: 1 },
			})
		);
		expect(score).toBe(100);
	});
});

/**
 * The bug these pin: `clamp01(mean)` floored every negative mean at 0, so the
 * whole against half of the scale collapsed onto one value and a classmate
 * warming from "strongly against" to "neutral" moved the score by nothing —
 * in exactly the situation where a proposal most needs rewriting.
 */
describe('calcBridgingScore — the against half of the scale', () => {
	const opposedCamp = (mean: number): AgoraCampAggregate => ({
		sum: mean * 4,
		n: 4,
		positiveN: 0,
	});

	it('registers a cross-camp warming that never leaves the negative range', () => {
		const before = calcBridgingScore({
			...input(AgoraCamp.left, { left: opposedCamp(-0.5), right: opposedCamp(-1) }),
			crossCampPool: 4,
		});
		const after = calcBridgingScore({
			...input(AgoraCamp.left, { left: opposedCamp(-0.5), right: opposedCamp(-0.5) }),
			crossCampPool: 4,
		});

		expect(after).toBeGreaterThan(before);
	});

	it('is monotone all the way up the scale, with no flat stretch', () => {
		const at = (mean: number): number =>
			calcBridgingScore({
				...input(AgoraCamp.left, { left: opposedCamp(mean), right: opposedCamp(mean) }),
				crossCampPool: 4,
			});
		const steps = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map(at);

		for (let index = 1; index < steps.length; index++) {
			expect(steps[index]).toBeGreaterThan(steps[index - 1]);
		}
		expect(steps[0]).toBe(0);
		expect(steps[steps.length - 1]).toBe(100);
	});

	it('reads an indifferent class at the halfway mark — and pays it nothing', () => {
		const shrug = calcBridgingScore({
			...input(AgoraCamp.left, {
				left: { sum: 0, n: 4, positiveN: 0 },
				right: { sum: 0, n: 4, positiveN: 0 },
			}),
			crossCampPool: 4,
		});

		expect(shrug).toBe(50);
		// Shrugging is not bridging: the halfway mark must sit under the ladder
		expect(bridgingTierFor(shrug)).toBe(0);
	});

	it('treats a camp that never rated as absent, not as neutral', () => {
		const silent = calcBridgingScore(input(AgoraCamp.left, { left: { sum: 0, n: 0, positiveN: 0 } }));

		expect(silent).toBe(0);
	});

	it('keeps the credit costing the class sentiment it always cost', () => {
		// The re-pointed thresholds are the old ones rewritten in the new units.
		// Both camps at a mean of m scored 100m before and score 100(m+1)/2 now,
		// so the SENTIMENT each rung costs is unchanged: tier 1 at m ≈ 0.4, tier
		// 2 at m ≈ 0.6. (Only the rounding edge moves, by 0.005 of a mean — an
		// integer score cannot land on a boundary more precisely than that,
		// which was equally true of the old term.)
		const at = (mean: number): number =>
			calcBridgingScore({
				...input(AgoraCamp.left, {
					left: { sum: mean * 4, n: 4, positiveN: 4 },
					right: { sum: mean * 4, n: 4, positiveN: 4 },
				}),
				crossCampPool: 4,
			});

		expect(bridgingTierFor(at(0.35))).toBe(0);
		expect(bridgingTierFor(at(0.45))).toBe(1);
		expect(bridgingTierFor(at(0.55))).toBe(1);
		expect(bridgingTierFor(at(0.65))).toBe(2);
	});
});

describe('calcBridgingScore — small-class confidence', () => {
	const enthusiastic: AgoraCampAggregate = { sum: 1, n: 1, positiveN: 1 };
	const ownCamp: AgoraCampAggregate = { sum: 2, n: 2, positiveN: 2 };

	it('divides by MIN_CROSS_RATERS when the class size is unknown', () => {
		// The historical behaviour, preserved: no pool supplied → full ramp
		const score = calcBridgingScore(
			input(AgoraCamp.left, { left: ownCamp, right: enthusiastic })
		);
		const expected = Math.round(
			100 *
				(AGORA_BRIDGING.SAME_CAMP_WEIGHT +
					AGORA_BRIDGING.CROSS_CAMP_WEIGHT * (1 / AGORA_BRIDGING.MIN_CROSS_RATERS))
		);
		expect(score).toBe(expected);
	});

	it('makes the credit threshold reachable when only one cross-camp student exists', () => {
		// The bug this fixes: in a small class the bridging credit was
		// arithmetically impossible — one rater over a fixed denominator of 3
		// capped the score below the threshold no matter how strong support was
		const withoutPool = calcBridgingScore(
			input(AgoraCamp.left, { left: ownCamp, right: enthusiastic })
		);
		const withPool = {
			...input(AgoraCamp.left, { left: ownCamp, right: enthusiastic }),
			crossCampPool: 1,
		};
		expect(withoutPool).toBeLessThan(AGORA_BRIDGING.CREDIT_THRESHOLD);
		expect(calcBridgingScore(withPool)).toBe(100);
	});

	it('never lets a big class off the hook — the pool caps at MIN_CROSS_RATERS', () => {
		const generousPool = {
			...input(AgoraCamp.left, { left: ownCamp, right: enthusiastic }),
			crossCampPool: 30,
		};
		const exactlyMin = {
			...input(AgoraCamp.left, { left: ownCamp, right: enthusiastic }),
			crossCampPool: AGORA_BRIDGING.MIN_CROSS_RATERS,
		};
		expect(calcBridgingScore(generousPool)).toBe(calcBridgingScore(exactlyMin));
	});

	it('never divides by zero when nobody sits in the other camp', () => {
		const noPool = {
			...input(AgoraCamp.left, { left: ownCamp }),
			crossCampPool: 0,
		};
		expect(Number.isFinite(calcBridgingScore(noPool))).toBe(true);
		expect(calcBridgingScore(noPool)).toBe(
			Math.round(100 * AGORA_BRIDGING.SAME_CAMP_WEIGHT)
		);
	});

	it('applies the pool to a center-camp author too', () => {
		const centered = {
			...input(AgoraCamp.center, {
				center: { sum: 1, n: 1, positiveN: 1 },
				right: enthusiastic,
			}),
			crossCampPool: 1,
		};
		expect(calcBridgingScore(centered)).toBe(100);
	});
});

describe('bridging ladder', () => {
	it('reads the tier off the score', () => {
		expect(bridgingTierFor(0)).toBe(0);
		expect(bridgingTierFor(AGORA_BRIDGING.CREDIT_THRESHOLD_TIER_1 - 1)).toBe(0);
		expect(bridgingTierFor(AGORA_BRIDGING.CREDIT_THRESHOLD_TIER_1)).toBe(1);
		expect(bridgingTierFor(AGORA_BRIDGING.CREDIT_THRESHOLD - 1)).toBe(1);
		expect(bridgingTierFor(AGORA_BRIDGING.CREDIT_THRESHOLD)).toBe(2);
		expect(bridgingTierFor(100)).toBe(2);
	});

	it('pays each rung exactly once as a proposal climbs', () => {
		const step1 = bridgingPayout(1) - bridgingPayout(0);
		const step2 = bridgingPayout(2) - bridgingPayout(1);
		expect(step1).toBe(AGORA_POINTS.BRIDGING_BONUS_TIER_1);
		expect(step2).toBe(AGORA_POINTS.BRIDGING_BONUS_TIER_2);
		// Climbing rung by rung must equal jumping straight to the top
		expect(step1 + step2).toBe(bridgingPayout(2) - bridgingPayout(0));
	});

	it('keeps the graduated ladder worth exactly the old single bonus', () => {
		expect(bridgingPayout(2)).toBe(AGORA_POINTS.BRIDGING_BONUS);
	});

	it('tier 1 is unreachable on same-camp support alone', () => {
		// The self-guarding property: own-camp support maxes out at
		// SAME_CAMP_WEIGHT × 100, which must sit below the first threshold —
		// so "reached across" can never be earned without reaching across
		const sameCampCeiling = Math.round(100 * AGORA_BRIDGING.SAME_CAMP_WEIGHT);
		expect(sameCampCeiling).toBeLessThan(AGORA_BRIDGING.CREDIT_THRESHOLD_TIER_1);
	});
});
