import type { AttitudeMap } from './distance';
import type { GameContent, IslandContent } from './game';

/**
 * The route through the islands.
 *
 * Players used to choose their islands on a map before setting out. The first
 * reviewer to try it said plainly that choosing up front made no sense — you
 * cannot know which islands matter to you before you have seen any — so the
 * voyage now sails every enabled island in the game's own order, and the
 * player stops whenever they like. These are the rules for that route, in one
 * place, so the island screen, its strip of islands and the voyage strip in
 * the top bar all agree on what "sailed" and "next" mean.
 */

/**
 * Every island on the route, in the order the organizer set (`loadGame`
 * already sorts by `sortOrder`). The same filter as `enabledIslands`, written
 * out rather than imported: game.ts pulls in Firebase, and this file has to
 * stay importable by the tests and the top-bar strip without it.
 */
export function voyageIslands(content: GameContent | null): IslandContent[] {
	return content ? content.islands.filter((island) => island.enabled) : [];
}

/**
 * An island counts as sailed the moment one of its stances is marked — which
 * is exactly what the island screen requires before "להמשך המסע".
 */
export function islandSailed(island: IslandContent, attitudes: AttitudeMap): boolean {
	return island.stances.some((stance) => attitudes[stance.statementId] !== undefined);
}

export function sailedCount(islands: IslandContent[], attitudes: AttitudeMap): number {
	return islands.filter((island) => islandSailed(island, attitudes)).length;
}

/**
 * Where "the next island" leads from `current`.
 *
 * The first island not yet sailed AFTER the current one, then — wrapping round
 * — any unsailed island before it, so a player who sailed back to an earlier
 * island to change an answer is carried on to the islands still waiting, not
 * marched through ones they have already answered. `null` when every island
 * is sailed: the voyage is complete and the way on is the summary.
 */
export function nextIslandIndex(
	islands: IslandContent[],
	attitudes: AttitudeMap,
	current: number,
): number | null {
	const count = islands.length;
	for (let step = 1; step <= count; step++) {
		const candidate = (current + step) % count;
		if (candidate === current) continue;
		if (!islandSailed(islands[candidate], attitudes)) return candidate;
	}

	return null;
}
