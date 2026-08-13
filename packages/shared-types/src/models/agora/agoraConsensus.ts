/**
 * Finite-population class consensus for the Agora game.
 *
 * A classroom is the purest case of a known, finite stakeholder set: the
 * population is the students in the room, and it is small enough that everyone
 * really can rate everything. Once they have, the class's opinion of a proposal
 * is not estimated — it is counted. The general C_p was hedging against
 * classmates who do not exist, so a class of six unanimously in favour scored
 * 0.33 instead of 1.
 *
 * Agora computes this itself rather than reading the statement-level score for
 * two hard reasons: the AI character raters write real evaluations (so the
 * statement aggregates include non-students), and their values are off-grid —
 * agoraScoreToEvaluation(33) === -0.34 — which no five-level histogram can
 * hold. Neither belongs in a number describing what the class thinks. The math
 * itself is the shared calcAgreement, so the two cannot drift.
 */

import { calcAgreement, calcLikeMindedness } from '../../utils/consensusCalculation';
import { warmth } from './agoraBridging';
import type { AgoraCamp } from './agoraEnums';
import { AGORA_RATING_LEVELS } from './agoraScore';
import type { AgoraCampAggregate, AgoraClassConsensus, AgoraRatingDist } from './agoraScore';

export function emptyDist(): AgoraRatingDist {
	return [0, 0, 0, 0, 0];
}

/**
 * The bucket a rating value belongs to.
 *
 * Defensive by necessity: the security rules only require the evaluation to be
 * a number, so nothing stops a buggy or hostile client writing 0.37 or 5.
 * Snapping to the nearest level keeps the invariant the whole design rests on
 * — Σ dist === n — and bounds the error at ±0.25 instead of corrupting the
 * histogram or throwing inside a trigger.
 */
export function agoraRatingBucket(value: number): number {
	if (!Number.isFinite(value)) return 2; // NaN/±Infinity → neutral

	let best = 0;
	let bestDistance = Infinity;
	for (let index = 0; index < AGORA_RATING_LEVELS.length; index++) {
		const distance = Math.abs(AGORA_RATING_LEVELS[index] - value);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = index;
		}
	}

	return best;
}

/**
 * Exact moments of a histogram. The rating levels (1, 0.5, 0.25 as squares)
 * are all exactly representable in binary floating point, so these are exact
 * with no accumulation drift — unlike a running sum-of-squares, which can only
 * be trusted as far as its last replay.
 *
 * Negative counts (the fingerprint of a double-applied delta) clamp to zero
 * rather than propagating into a variance nobody can audit.
 */
export function distMoments(dist?: AgoraRatingDist): {
	n: number;
	sum: number;
	sumSquares: number;
} {
	if (!dist) return { n: 0, sum: 0, sumSquares: 0 };

	let n = 0;
	let sum = 0;
	let sumSquares = 0;
	for (let index = 0; index < AGORA_RATING_LEVELS.length; index++) {
		const count = Math.max(0, dist[index] ?? 0);
		const level = AGORA_RATING_LEVELS[index];
		n += count;
		sum += count * level;
		sumSquares += count * level * level;
	}

	return { n, sum, sumSquares };
}

/** Sum two histograms (used to fold the three camps into one class view) */
export function addDist(a: AgoraRatingDist, b: AgoraRatingDist): AgoraRatingDist {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4]];
}

/**
 * The best C_p a proposal could possibly reach given how many rated it and how
 * many could have — i.e. the score of a hypothetical proposal every one of
 * those n raters loved.
 *
 * This exists because coverage in Agora is structurally capped: a student's
 * rating budget is fixed (ROUNDS × RATINGS_PER_ROUND), so with one proposal per
 * student, coverage is roughly budget/(class − 1) — a full census up to about
 * sixteen students, then falling away. At identical class sentiment the raw
 * score therefore drops sharply as the class grows, which would make the game's
 * success threshold reachable for a small class and arithmetically impossible
 * for a large one. Dividing by this ceiling removes that bias.
 */
export function consensusCeiling(n: number, populationSize?: number): number {
	if (n <= 0) return 0;

	// All n ratings at +1 → sum = n, sumSquares = n
	return calcAgreement(n, n, n, populationSize);
}

/**
 * C_p as a fraction of what was achievable, in [0, 1]. Use this to compare
 * across classes of different sizes; use the raw consensus within one class.
 */
export function normalizedConsensus(consensus: number, n: number, populationSize?: number): number {
	const ceiling = consensusCeiling(n, populationSize);
	if (ceiling <= 0) return 0;

	return Math.min(1, Math.max(0, consensus) / ceiling);
}

/** What the class, taken as one body, thinks of a proposal right now */
export interface AgoraClassSupport {
	/** Mean student rating, -1…1 */
	mean: number;
	/** Students behind it */
	n: number;
	/** The same mean on the 0-100 scale every other support figure uses */
	percent: number;
}

/**
 * The class's average support for a proposal, 0-100.
 *
 * This is the number an author's improvement loop reports, and it is
 * deliberately NOT the bridging score. Bridging is a composite — same-camp and
 * cross-camp support blended by weight and damped by a confidence ramp — so one
 * classmate genuinely changing their mind can move it by less than a point and
 * round away to nothing. An author who revised, won someone over, and was told
 * "it has not moved yet" has been told something false about the only feedback
 * the exercise offers. The mean carries no weights and no ramp: every change of
 * mind shows up in it, in the direction it was made.
 *
 * Counted over the student histogram, so it matches the camp meters on the
 * results board exactly, and so the characters' synthetic raters — whose
 * off-grid values no five-level bucket can hold — never speak for the class.
 * A student with no camp still counts: they are filed under centre in the
 * histogram, which is precisely the population this asks about.
 *
 * Returns undefined when no student has rated. Absence is not zero — zero on
 * this scale means "unanimously, maximally against".
 */
export function agoraClassSupport(perCamp: {
	left: AgoraCampAggregate;
	right: AgoraCampAggregate;
	center: AgoraCampAggregate;
}): AgoraClassSupport | undefined {
	const combined = [perCamp.left, perCamp.right, perCamp.center].reduce(
		(accumulator, camp) => addDist(accumulator, camp.studentDist ?? emptyDist()),
		emptyDist(),
	);
	const { n, sum } = distMoments(combined);
	if (n <= 0) return undefined;

	const mean = sum / n;

	return { mean, n, percent: Math.round(warmth(mean) * 100) };
}

/** Positioned, non-AI students per camp */
export interface AgoraCampCensus {
	left: number;
	right: number;
	center: number;
}

/**
 * Who COULD have rated this proposal: positioned students, minus the author.
 * The square never serves anyone their own text, so counting the author would
 * leave a fully-participating class permanently one rating short of a census —
 * and recognising a census is the whole point of the correction.
 *
 * Shared rather than duplicated: the trigger sizes the pool when it stores a
 * score, and the results screen sizes it again to show a live reading before
 * the trigger lands. Two copies of this rule would mean the number a student
 * watches and the number that gets stored can quietly disagree.
 */
export function eligiblePoolFor(
	score: { authorCamp: AgoraCamp; authorPositioned?: boolean },
	census: AgoraCampCensus,
): AgoraCampCensus {
	if (!score.authorPositioned) return census;

	return {
		...census,
		[score.authorCamp]: Math.max(0, census[score.authorCamp] - 1),
	};
}

export interface AgoraClassConsensusInput {
	perCamp: {
		left: AgoraCampAggregate;
		right: AgoraCampAggregate;
		center: AgoraCampAggregate;
	};
	/** Eligible student pool per camp, with the author's own seat already removed */
	eligible: { left: number; right: number; center: number };
}

/**
 * The class's consensus on one proposal.
 *
 * Returns undefined when no student histogram exists yet — a legacy score doc,
 * or a proposal only the AI characters have rated. Undefined means "no class
 * consensus", which the screens render as absence rather than as zero.
 */
export function calcAgoraClassConsensus(
	input: AgoraClassConsensusInput,
): AgoraClassConsensus | undefined {
	const { perCamp, eligible } = input;

	const combined = [perCamp.left, perCamp.right, perCamp.center].reduce(
		(accumulator, camp) => addDist(accumulator, camp.studentDist ?? emptyDist()),
		emptyDist(),
	);

	const { n, sum, sumSquares } = distMoments(combined);
	if (n <= 0) return undefined;

	const eligibleTotal = Math.max(0, eligible.left + eligible.right + eligible.center);
	// A pool smaller than the raters who actually turned up is stale data, not a
	// census. Trusting it would zero the penalty entirely, so fall back to
	// treating the raters themselves as the floor of the population.
	const populationSize = eligibleTotal > 0 ? Math.max(eligibleTotal, n) : undefined;

	const consensus = calcAgreement(sum, sumSquares, n, populationSize);
	const coverage = populationSize !== undefined ? Math.min(1, Math.max(0, n / populationSize)) : 0;

	return {
		consensus,
		mean: sum / n,
		n,
		eligible: populationSize ?? 0,
		coverage,
		normalized: normalizedConsensus(consensus, n, populationSize),
		polarization: 1 - calcLikeMindedness(sum, sumSquares, n),
	};
}
