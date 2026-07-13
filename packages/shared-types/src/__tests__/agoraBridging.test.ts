import {
	deriveCamp,
	calcBridgingScore,
	BridgingInput,
} from '../models/agora/agoraBridging';
import { AgoraCamp } from '../models/agora/agoraEnums';
import {
	AGORA_BRIDGING,
	AGORA_CAMP_BOUNDS,
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

	it('clamps negative support to zero rather than going negative', () => {
		const opposed: AgoraCampAggregate = { sum: -4, n: 4, positiveN: 0 };
		expect(
			calcBridgingScore(input(AgoraCamp.left, { left: opposed, right: opposed }))
		).toBe(0);
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
