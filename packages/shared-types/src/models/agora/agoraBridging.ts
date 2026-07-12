import { AgoraCamp } from './agoraEnums';
import { AGORA_BRIDGING, AGORA_CAMP_BOUNDS } from './agoraConstants';
import type { AgoraCampAggregate } from './agoraScore';

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
	const { authorCamp, perCamp } = input;
	const { SAME_CAMP_WEIGHT, CROSS_CAMP_WEIGHT, CENTER_CAMP_WEIGHT, MIN_CROSS_RATERS } =
		AGORA_BRIDGING;

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
		const conf = Math.min(1, otherN / MIN_CROSS_RATERS);

		return Math.round(
			100 * (SAME_CAMP_WEIGHT * own + CROSS_CAMP_WEIGHT * otherSupport * conf)
		);
	}

	const ownWing = authorCamp === AgoraCamp.left ? perCamp.left : perCamp.right;
	const otherWing = authorCamp === AgoraCamp.left ? perCamp.right : perCamp.left;
	const own = blend(ownWing);
	const other = blend(otherWing);
	const conf = Math.min(1, other.n / MIN_CROSS_RATERS);

	return Math.round(
		100 * (SAME_CAMP_WEIGHT * support(own) + CROSS_CAMP_WEIGHT * support(other) * conf)
	);
}
