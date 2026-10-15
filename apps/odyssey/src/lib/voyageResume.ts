import type { AttitudeMap } from './distance';

/**
 * Where a voyage opens, and which marks on screen are really "this visit's".
 *
 * Answers are stored per player per stance for the whole game (the evaluation
 * id is `${uid}--${stanceId}`), not per voyage. So "has an answer" only says the
 * player touched that island at some point, in this voyage or an earlier one.
 * The voyage used to open on the first island with no answers, and on the LAST
 * island when every chosen island already had some. A player returning to
 * re-sail finished islands therefore landed on "island 2 of 2" with every
 * stance already marked.
 */

interface IslandWithStances {
	stances: { statementId: string }[];
}

export function islandHasAnswer(island: IslandWithStances, attitudes: AttitudeMap): boolean {
	return island.stances.some((stance) => attitudes[stance.statementId] !== undefined);
}

/**
 * Index of the island the voyage opens on.
 * - `fresh` (the player just chose islands and pressed sail): always the first.
 * - otherwise (coming back mid-voyage): the first island not yet answered, so
 *   they resume where they stopped. A voyage with every island answered is
 *   finished, so it opens from the start rather than on its last island.
 */
export function voyageStartIndex(
	islands: IslandWithStances[],
	attitudes: AttitudeMap,
	fresh: boolean,
): number {
	if (fresh) return 0;
	const unanswered = islands.findIndex((island) => !islandHasAnswer(island, attitudes));

	return unanswered === -1 ? 0 : unanswered;
}

/**
 * A mark is the player's "earlier answer" when it exists but was not given in
 * this visit to the voyage screen.
 */
export function isEarlierAnswer(
	stanceId: string,
	attitudes: AttitudeMap,
	markedThisVisit: ReadonlySet<string>,
): boolean {
	return attitudes[stanceId] !== undefined && !markedThisVisit.has(stanceId);
}
