import type { OdysseyElder } from '@freedi/shared-types';

/**
 * Choosing the crew: how many sailors, and in what order they are offered.
 *
 * The sailors are the conscience of the game — they are there to help the
 * player make more conscious choices, not to make them. So the whole roster
 * is offered, nobody is pre-selected, and the player picks a crew of their
 * own. A tester who was handed three felt the choice had been made for him.
 */

/** Fewer than two voices is a monologue, not a council. */
export const CREW_MIN = 2;
/** More than five and the consult panel on an island is a wall of faces. */
export const CREW_MAX = 5;

export interface CrewLimits {
	min: number;
	max: number;
}

/**
 * The limits for a game with `elderCount` sailors on offer. A game that
 * authored fewer than CREW_MIN sailors cannot demand more than it has.
 */
export function crewLimits(elderCount: number): CrewLimits {
	const available = Math.max(0, elderCount);

	return {
		min: Math.min(CREW_MIN, available),
		max: Math.min(CREW_MAX, available),
	};
}

export function crewIsComplete(chosenCount: number, elderCount: number): boolean {
	const { min } = crewLimits(elderCount);

	return min > 0 && chosenCount >= min;
}

export function crewIsFull(chosenCount: number, elderCount: number): boolean {
	return chosenCount >= crewLimits(elderCount).max;
}

export interface RankedElder {
	elder: OdysseyElder;
	/** true when one of the sailor's values echoes a value the player ranked */
	matchesWinds: boolean;
}

/** Labels shorter than this match only exactly — "רוח" must not match "רוחב". */
const MIN_PARTIAL_MATCH = 3;

function labelsMatch(a: string, b: string): boolean {
	const left = a.trim();
	const right = b.trim();
	if (!left || !right) return false;
	if (left === right) return true;
	if (left.length < MIN_PARTIAL_MATCH || right.length < MIN_PARTIAL_MATCH) return false;

	return left.includes(right) || right.includes(left);
}

/**
 * The roster, ordered by closeness to the player's compass.
 *
 * Ordering is not choosing: every sailor is still offered and none is
 * ticked. Sailors whose declared values echo the values the player ranked on
 * רוח ההכרעה float to the top (the better the echo, the higher), and are
 * flagged so the screen can say why. Everyone else keeps the organizer's
 * order. Values are compared by label — the sailors' value ids are their own
 * ("mamlachtiut"), the game's are positional ("value-3") — exactly or as a
 * contained word, so "כבוד" meets "כבוד האדם" and "עתיד" meets "עתיד משותף".
 */
export function rankEldersByWinds(
	elders: OdysseyElder[],
	rankedValueLabels: string[],
): RankedElder[] {
	const scored = elders.map((elder, index) => {
		let score = 0;
		for (const value of elder.values) {
			const rank = rankedValueLabels.findIndex((label) => labelsMatch(label, value.label));
			if (rank !== -1) score += rankedValueLabels.length - rank;
		}

		return { elder, score, index };
	});

	return scored
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(({ elder, score }) => ({ elder, matchesWinds: score > 0 }));
}
