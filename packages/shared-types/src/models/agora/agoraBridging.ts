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

/**
 * One camp's warmth toward a proposal, 0…1, from its mean evaluation (-1…1).
 *
 * THE WHOLE RANGE, and that is the point. This used to be `clamp01(mean)`,
 * which floored every negative mean at 0 and so collapsed the entire against
 * half of the scale onto a single value. The consequence was not cosmetic: a
 * classmate moving from "ממש לא בעד" to "נמנעים" — a real, hard-won change of
 * mind, and the biggest one a revision can win — moved the bridging score by
 * exactly nothing. The improvement loop then reported "עוד לא זז" to an author
 * whose revision HAD worked, and it did so in precisely the situation where a
 * proposal most needs rewriting. The score was blind on the half of the scale
 * the game is about.
 *
 * So the mean is mapped, not clipped: -1 → 0, 0 → 0.5, +1 → 1. This is the
 * same mapping the results board already uses to draw a camp's support meter,
 * so the game now has ONE way of turning a camp mean into a quantity.
 *
 * Two properties survive the change, and both are load-bearing:
 *   • a camp that is unanimously, maximally against still contributes 0
 *   • a camp with NO raters contributes 0 too, not 0.5 — silence is absence
 *     of evidence, not neutrality, and a proposal nobody looked at must not
 *     score like one the class considered and shrugged at
 *
 * The thresholds move with it (see CREDIT_THRESHOLD* in agoraConstants), so
 * the sentiment a bridging credit costs is exactly what it was.
 */
export function warmth(mean: number): number {
	return (Math.max(-1, Math.min(1, mean)) + 1) / 2;
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
 *   S_c  = warmth(mean evaluation from camp c)    (evaluations are -1..1,
 *                                                  mapped onto 0..1; 0 if the
 *                                                  camp never rated)
 *   conf = min(1, n_other / MIN_CROSS_RATERS)     (cross-camp confidence ramp)
 *
 * Center-camp raters count toward BOTH camps at CENTER_CAMP_WEIGHT.
 * A center-camp author is treated symmetrically: both wings count as
 * "other" and same-camp support comes from the center itself.
 */
/**
 * How many students could plausibly have rated this proposal from across the
 * aisle — the denominator of the confidence ramp above.
 *
 * Lives here, beside `calcBridgingScore`, because it has to mirror that
 * function's blend exactly: for a wing author the other wing is "other" and the
 * centre counts at half weight; a centre author faces both wings. It used to be
 * a hand-written copy inside the evaluation trigger, with a comment admitting
 * as much — two statements of one rule, free to drift.
 */
export function crossCampPoolFor(
	authorCamp: AgoraCamp,
	counts: { left: number; right: number; center: number },
): number {
	if (authorCamp === AgoraCamp.center) return counts.left + counts.right;

	const otherWing = authorCamp === AgoraCamp.left ? counts.right : counts.left;

	return otherWing + counts.center * AGORA_BRIDGING.CENTER_CAMP_WEIGHT;
}

export function calcBridgingScore(input: BridgingInput): number {
	const { authorCamp, perCamp, crossCampPool } = input;
	const { SAME_CAMP_WEIGHT, CROSS_CAMP_WEIGHT, CENTER_CAMP_WEIGHT } = AGORA_BRIDGING;

	const blend = (wing: AgoraCampAggregate): AgoraCampAggregate => ({
		sum: wing.sum + perCamp.center.sum * CENTER_CAMP_WEIGHT,
		n: wing.n + perCamp.center.n * CENTER_CAMP_WEIGHT,
		positiveN: wing.positiveN + perCamp.center.positiveN * CENTER_CAMP_WEIGHT,
	});

	// n === 0 is 0, NOT warmth(0): a camp that never rated has not shrugged at
	// the proposal, it has not read it
	const support = (agg: AgoraCampAggregate): number => (agg.n > 0 ? warmth(agg.sum / agg.n) : 0);

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

		return Math.round(100 * (SAME_CAMP_WEIGHT * own + CROSS_CAMP_WEIGHT * otherSupport * conf));
	}

	const ownWing = authorCamp === AgoraCamp.left ? perCamp.left : perCamp.right;
	const otherWing = authorCamp === AgoraCamp.left ? perCamp.right : perCamp.left;
	const own = blend(ownWing);
	const other = blend(otherWing);
	const conf = crossCampConfidence(other.n, crossCampPool);

	return Math.round(
		100 * (SAME_CAMP_WEIGHT * support(own) + CROSS_CAMP_WEIGHT * support(other) * conf),
	);
}
