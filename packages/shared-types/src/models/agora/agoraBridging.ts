import { AgoraCamp } from './agoraEnums';
import { AGORA_BRIDGING, AGORA_CAMP_BOUNDS, AGORA_POINTS } from './agoraConstants';
import type { AgoraCampAggregate } from './agoraScore';

/**
 * Which rung of the bridging ladder a score has reached.
 * 0 = none, 1 = reached across, 2 = full bridge.
 */
export function bridgingTierFor(bridgingScore: number): number {
	if (bridgingScore >= AGORA_BRIDGING.CREDIT_THRESHOLD) return 2;
	if (bridgingScore >= AGORA_BRIDGING.CREDIT_THRESHOLD_TIER_1) return 1;

	return 0;
}

/**
 * CUMULATIVE payout at a tier. Awarding a tier means paying the difference
 * between this and what was already paid, so a proposal that jumps straight
 * from nothing to a full bridge earns both rungs at once and never more.
 */
export function bridgingPayout(tier: number): number {
	if (tier >= 2) return AGORA_POINTS.BRIDGING_BONUS_TIER_1 + AGORA_POINTS.BRIDGING_BONUS_TIER_2;
	if (tier >= 1) return AGORA_POINTS.BRIDGING_BONUS_TIER_1;

	return 0;
}

/** Derive the camp from a 0-100 positioning-scale value */
export function deriveCamp(campPosition: number): AgoraCamp {
	if (campPosition <= AGORA_CAMP_BOUNDS.LEFT_MAX) return AgoraCamp.left;
	if (campPosition >= AGORA_CAMP_BOUNDS.RIGHT_MIN) return AgoraCamp.right;

	return AgoraCamp.center;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export interface BridgingInput {
	authorCamp: AgoraCamp;
	perCamp: {
		left: AgoraCampAggregate;
		right: AgoraCampAggregate;
		center: AgoraCampAggregate;
	};
	/**
	 * How many students actually sit in the camps that count as "other" for
	 * this author. Optional: without it the confidence ramp always divides by
	 * MIN_CROSS_RATERS, which makes a high bridging score arithmetically
	 * impossible in a small class (4 students → at most 1-2 cross-camp
	 * raters exist, so conf caps at 1/3 and the score can never clear the
	 * credit threshold). Supplying the real pool asks the honest question —
	 * "of the cross-camp students that EXIST, how many support this?" —
	 * without ever inflating past MIN_CROSS_RATERS in a full class.
	 */
	crossCampPool?: number;
}

/**
 * Cross-camp confidence: n_other / min(MIN_CROSS_RATERS, pool), capped at 1.
 * The denominator never exceeds MIN_CROSS_RATERS (a big class must still
 * earn three cross-camp raters) and never drops below 1 (no divide-by-zero,
 * and one rater in a class where only one could rate is full confidence).
 */
function crossCampConfidence(otherN: number, crossCampPool?: number): number {
	const { MIN_CROSS_RATERS } = AGORA_BRIDGING;
	const denominator =
		crossCampPool === undefined
			? MIN_CROSS_RATERS
			: Math.max(1, Math.min(MIN_CROSS_RATERS, crossCampPool));

	return Math.min(1, otherN / denominator);
}

/**
 * Camp-aware bridging score, 0-100.
 *
 * bridging = 100 × (SAME_W × S_own + CROSS_W × S_other × conf)
 *   S_c  = clamp01(mean evaluation from camp c)   (evaluations are -1..1)
 *   conf = min(1, n_other / MIN_CROSS_RATERS)     (cross-camp confidence ramp)
 *
 * Center-camp raters count toward BOTH camps at CENTER_CAMP_WEIGHT.
 * A center-camp author is treated symmetrically: both wings count as
 * "other" and same-camp support comes from the center itself.
 */
export function calcBridgingScore(input: BridgingInput): number {
	const { authorCamp, perCamp, crossCampPool } = input;
	const { SAME_CAMP_WEIGHT, CROSS_CAMP_WEIGHT, CENTER_CAMP_WEIGHT } = AGORA_BRIDGING;

	const blend = (wing: AgoraCampAggregate): AgoraCampAggregate => ({
		sum: wing.sum + perCamp.center.sum * CENTER_CAMP_WEIGHT,
		n: wing.n + perCamp.center.n * CENTER_CAMP_WEIGHT,
		positiveN: wing.positiveN + perCamp.center.positiveN * CENTER_CAMP_WEIGHT,
	});

	const support = (agg: AgoraCampAggregate): number =>
		agg.n > 0 ? clamp01(agg.sum / agg.n) : 0;

	if (authorCamp === AgoraCamp.center) {
		// Both wings are "other"; own support is the center itself
		const own = support(perCamp.center);
		const otherN = perCamp.left.n + perCamp.right.n;
		const otherSupport = support({
			sum: perCamp.left.sum + perCamp.right.sum,
			n: otherN,
			positiveN: perCamp.left.positiveN + perCamp.right.positiveN,
		});
		const conf = crossCampConfidence(otherN, crossCampPool);

		return Math.round(
			100 * (SAME_CAMP_WEIGHT * own + CROSS_CAMP_WEIGHT * otherSupport * conf)
		);
	}

	const ownWing = authorCamp === AgoraCamp.left ? perCamp.left : perCamp.right;
	const otherWing = authorCamp === AgoraCamp.left ? perCamp.right : perCamp.left;
	const own = blend(ownWing);
	const other = blend(otherWing);
	const conf = crossCampConfidence(other.n, crossCampPool);

	return Math.round(
		100 * (SAME_CAMP_WEIGHT * support(own) + CROSS_CAMP_WEIGHT * support(other) * conf)
	);
}
