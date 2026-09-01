/**
 * Opinion distance — how far apart two people's answers are.
 *
 * The metric implements §1 of `apps/agora/docs/opinion-distance-and-map.md`:
 *
 *   d(a, b) = mean( |eₐ(s) − e_b(s)| )   over stances BOTH sides evaluated
 *
 * The raw value lives in [0, 2] (0 = identical, 2 = always opposed) and is
 * exposed normalized to [0, 1], so every screen keeps the "0 = sails exactly
 * your route, 1 = opposite route" contract.
 *
 * It lives here rather than in the Odyssey app because two callers now need
 * the SAME arithmetic: Odyssey's sea and opinion map draw it per player, and a
 * civic Agora event scores itself on whether the deliberation moved people
 * closer together. Two implementations of one metric would let those two
 * answers disagree about the same room.
 */

/** stance statementId → evaluation value (-1..1) */
export type AttitudeMap = Record<string, number>;

/**
 * Doc §1: below ~5 shared stances a pair distance is noise.
 *
 * That is the right floor across a whole voyage. It is unreachable inside ONE
 * island, which carries about four stances — so convergence passes its own,
 * lower floor rather than pretending the rule does not exist.
 */
export const MIN_SHARED_STANCES = 5;

/** The most a single island's convergence may demand, since it has ~4 stances. */
export const CONVERGENCE_MIN_SHARED_CAP = 3;

/**
 * Anything that declares a course through the islands — Odyssey parties and
 * elders share this shape, so the same virtual-user arithmetic covers both.
 *
 * Two ways to declare one, and they are not equivalent. `attitudes` is a
 * researched score per stance, the only shape that can say "mildly against"
 * rather than "against". `positions` is the older one-stance-per-island
 * declaration, which fans out as +1 on the chosen stance and −1 on its
 * siblings — a caricature of a position, but all some route holders carry.
 */
export interface RouteHolder {
	/** island statementId → declared stance statementId */
	positions?: Record<string, string>;
	/** stance statementId → continuous −1..1 score. Wins where present. */
	attitudes?: Record<string, number>;
}

/** The minimum an island must expose for a route to be projected onto it. */
export interface RouteIsland {
	statementId: string;
	stances: ReadonlyArray<{ statementId: string }>;
}

/**
 * A route holder's declared course as a virtual attitude map.
 *
 * Lives here, next to `opinionDistance`, because two callers need the SAME
 * projection: the Odyssey client's sea/opinion map and the voyage-story email
 * digest. Two copies of this arithmetic drifted once (the digest ignored
 * continuous `attitudes`); one copy cannot.
 */
export function routeAttitudes(
	holder: RouteHolder,
	islands: ReadonlyArray<RouteIsland>,
): AttitudeMap {
	const attitudes: AttitudeMap = {};
	for (const island of islands) {
		const declaredStanceId = holder.positions?.[island.statementId];
		for (const stance of island.stances) {
			const score = holder.attitudes?.[stance.statementId];
			if (score !== undefined) {
				attitudes[stance.statementId] = score;
			} else if (declaredStanceId) {
				attitudes[stance.statementId] = stance.statementId === declaredStanceId ? 1 : -1;
			}
		}
	}

	return attitudes;
}

export interface OpinionDistanceResult {
	/** Normalized 0..1 (doc metric / 2); null under the min-overlap rule. */
	distance: number | null;
	sharedStances: number;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/** The doc §1 metric between two attitude maps. */
export function opinionDistance(
	a: AttitudeMap,
	b: AttitudeMap,
	minShared: number = MIN_SHARED_STANCES,
): OpinionDistanceResult {
	let sum = 0;
	let shared = 0;
	for (const [stanceId, aValue] of Object.entries(a)) {
		const bValue = b[stanceId];
		if (bValue === undefined) continue;
		sum += Math.abs(aValue - bValue);
		shared += 1;
	}

	return {
		distance: shared >= Math.max(1, minShared) ? round2(sum / shared / 2) : null,
		sharedStances: shared,
	};
}

export interface ConvergenceInput {
	/** Each participant's stances as they stood when they entered the square */
	baselines: Map<string, AttitudeMap>;
	/** The same participants' stances after the deliberation */
	current: Map<string, AttitudeMap>;
	/** Overlap floor; callers on a single island pass CONVERGENCE_MIN_SHARED_CAP */
	minShared: number;
}

export interface ConvergenceMeans {
	/** Mean pairwise distance before the deliberation, 0..1; null if no pair qualified */
	before: number | null;
	/** The same mean after it */
	after: number | null;
	/** How many pairs both means were computed over */
	pairs: number;
	/** How many people those pairs were drawn from */
	participants: number;
}

/**
 * Mean pairwise distance before and after, over the SAME set of people.
 *
 * Everything here exists to keep one number honest. A participant who never
 * re-rated is dropped from both means rather than from one, because a room
 * that measures its "before" over everybody and its "after" over only the
 * people still present will report convergence for a room that merely emptied.
 * For the same reason a pair contributes to both means or to neither: pairs
 * whose overlap clears the floor in one snapshot but not the other would
 * change the population between the two halves of the comparison.
 */
export function convergenceMeans(input: ConvergenceInput): ConvergenceMeans {
	const { baselines, current, minShared } = input;

	const uids = [...baselines.keys()].filter((uid) => current.has(uid)).sort();

	let beforeSum = 0;
	let afterSum = 0;
	let pairs = 0;

	for (let i = 0; i < uids.length; i += 1) {
		for (let j = i + 1; j < uids.length; j += 1) {
			const before = opinionDistance(
				baselines.get(uids[i]) as AttitudeMap,
				baselines.get(uids[j]) as AttitudeMap,
				minShared,
			);
			const after = opinionDistance(
				current.get(uids[i]) as AttitudeMap,
				current.get(uids[j]) as AttitudeMap,
				minShared,
			);
			if (before.distance === null || after.distance === null) continue;

			beforeSum += before.distance;
			afterSum += after.distance;
			pairs += 1;
		}
	}

	if (pairs === 0) {
		return { before: null, after: null, pairs: 0, participants: uids.length };
	}

	return {
		before: round2(beforeSum / pairs),
		after: round2(afterSum / pairs),
		pairs,
		participants: uids.length,
	};
}

/**
 * The headline number: how much of the room's disagreement closed, in percent.
 *
 * Signed on purpose — a deliberation that pushed people apart has to be able
 * to say so. A room that started in perfect agreement has nothing to close and
 * scores 0 rather than dividing by zero.
 */
export function convergenceScore(before: number | null, after: number | null): number | null {
	if (before === null || after === null) return null;
	if (before <= 0) return 0;

	return Math.round(((before - after) / before) * 100);
}
