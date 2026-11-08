import type { PartyDistance } from './distance';

/** Distances this close are one place: the stored distance is rounded to 2
 *  decimals, so anything under half a hundredth is the same rounded value. */
export const TIE_EPSILON = 0.005;

/** Fewer shared islands than this and the match is only a first impression. */
export const EARLY_RESULT_ISLANDS = 3;

export type MatchEvidence = 'early' | 'solid';

export interface MatchConfidence {
	/** Parties sharing first place (one entry when there is no tie), nearest first. */
	firstPlace: PartyDistance[];
	/** True when two or more parties share first place. */
	isTie: boolean;
	evidence: MatchEvidence;
	/** Statements the player answered. */
	answeredStatements: number;
	/** Islands the player answered at least one statement on. */
	answeredIslands: number;
}

/**
 * Honest summary of a party match: who is tied for first, and whether the
 * evidence is thin. Pure — does not touch the distance maths.
 *
 * `distances` need not be sorted. Entries with a null distance are ignored.
 */
export function matchConfidence(
	distances: PartyDistance[],
	answeredStatements: number,
	answeredIslands: number,
): MatchConfidence {
	const placed = distances
		.filter((entry): entry is PartyDistance & { distance: number } => entry.distance !== null)
		.sort((a, b) => a.distance - b.distance);
	const best = placed.length > 0 ? placed[0].distance : null;
	const firstPlace =
		best === null ? [] : placed.filter((entry) => entry.distance - best <= TIE_EPSILON);
	const widestShared = placed.reduce((max, entry) => Math.max(max, entry.sharedIslands), 0);

	return {
		firstPlace,
		isTie: firstPlace.length > 1,
		evidence: widestShared < EARLY_RESULT_ISLANDS ? 'early' : 'solid',
		answeredStatements,
		answeredIslands,
	};
}
