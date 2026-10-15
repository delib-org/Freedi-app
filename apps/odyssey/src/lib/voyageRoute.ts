import type { AttitudeMap } from './distance';
import { islandHasAnswer } from './voyageResume';

/**
 * The route through the chosen islands: which are behind the player, which
 * is under their feet, which still wait — and where "the next island" leads.
 *
 * A tester standing on "אי 3 מתוך 3" could not tell how to reach the other
 * islands he had chosen: the only way off an island was "the next one". The
 * strip on every island reads this, and so does the button at the foot of
 * the island, so the two never disagree about what "next" means.
 */

interface RouteIsland {
	statementId: string;
	stances: { statementId: string }[];
}

export type RouteStopStatus =
	/** at least one shore marked */
	| 'done'
	/** the island the player is standing on */
	| 'current'
	/** not yet sailed */
	| 'open';

export interface RouteStop<T extends RouteIsland> {
	island: T;
	index: number;
	status: RouteStopStatus;
}

export function routeStops<T extends RouteIsland>(
	islands: T[],
	attitudes: AttitudeMap,
	currentIndex: number,
): RouteStop<T>[] {
	return islands.map((island, index) => ({
		island,
		index,
		status:
			index === currentIndex ? 'current' : islandHasAnswer(island, attitudes) ? 'done' : 'open',
	}));
}

export function sailedCount(islands: RouteIsland[], attitudes: AttitudeMap): number {
	return islands.filter((island) => islandHasAnswer(island, attitudes)).length;
}

/**
 * Where "the next island" leads from `current`.
 *
 * In order first: the island after this one, whether or not it already has
 * an answer, so a voyage sailed fresh from the map walks its islands one by
 * one (see `voyageStartIndex`, which opens a fresh voyage on island 1 for
 * the same reason). Past the last island, any island skipped earlier — a
 * player who jumped ahead from the strip is carried back to what they left.
 * `null` when nothing is left: the way on is the summary.
 */
export function nextIslandIndex(
	islands: RouteIsland[],
	attitudes: AttitudeMap,
	current: number,
): number | null {
	if (current + 1 < islands.length) return current + 1;
	const skipped = islands.findIndex(
		(island, index) => index !== current && !islandHasAnswer(island, attitudes),
	);

	return skipped === -1 ? null : skipped;
}

/**
 * What the island map opens with.
 *
 * Nothing, on a voyage not yet begun: the tester's "בלי בחירה מלכתחילה". A
 * saved route the player has already started sailing is a different thing —
 * coming back to the map then is editing a voyage in progress, and wiping it
 * would lose the islands they still mean to visit. Only ids of islands that
 * still exist and are enabled survive either way.
 */
export function initialRouteSelection(
	savedIds: string[] | undefined,
	islands: RouteIsland[],
	attitudes: AttitudeMap,
): string[] {
	const saved = (savedIds ?? []).filter((id) =>
		islands.some((island) => island.statementId === id),
	);
	const begun = islands.some(
		(island) => saved.includes(island.statementId) && islandHasAnswer(island, attitudes),
	);

	return begun ? saved : [];
}
