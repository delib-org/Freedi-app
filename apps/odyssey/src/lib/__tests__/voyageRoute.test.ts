import { describe, expect, it } from 'vitest';
import type { GameContent, IslandContent } from '../game';
import { islandSailed, nextIslandIndex, sailedCount, voyageIslands } from '../voyageRoute';

function island(statementId: string, stanceIds: string[], enabled = true): IslandContent {
	return {
		statementId,
		enabled,
		stances: stanceIds.map((id) => ({ statementId: id })),
	} as unknown as IslandContent;
}

const route = [
	island('i1', ['a1', 'a2']),
	island('i2', ['b1', 'b2']),
	island('i3', ['c1']),
	island('i4', ['d1']),
];

describe('voyageIslands', () => {
	it('is every enabled island, in the game order, with no choosing', () => {
		const content = {
			islands: [island('i1', ['s1']), island('off', ['s2'], false), island('i2', ['s3'])],
		} as unknown as GameContent;
		expect(voyageIslands(content).map((entry) => entry.statementId)).toEqual(['i1', 'i2']);
	});

	it('is empty without a game', () => {
		expect(voyageIslands(null)).toEqual([]);
	});
});

describe('islandSailed / sailedCount', () => {
	it('one marked stance sails the island', () => {
		expect(islandSailed(route[0], {})).toBe(false);
		expect(islandSailed(route[0], { a2: -1 })).toBe(true);
		// A neutral mark (0) is still a mark.
		expect(islandSailed(route[2], { c1: 0 })).toBe(true);
		expect(sailedCount(route, { a1: 1, c1: 0 })).toBe(2);
	});
});

describe('nextIslandIndex', () => {
	it('goes to the following island on a fresh voyage', () => {
		expect(nextIslandIndex(route, { a1: 1 }, 0)).toBe(1);
	});

	it('skips islands already sailed', () => {
		expect(nextIslandIndex(route, { a1: 1, b1: 1 }, 0)).toBe(2);
	});

	it('wraps round to islands skipped earlier', () => {
		// Sailed i1 and i4, now standing on i4: i2 is still waiting.
		expect(nextIslandIndex(route, { a1: 1, d1: 1 }, 3)).toBe(1);
	});

	it('carries a player who went back to change an answer on to what is left', () => {
		expect(nextIslandIndex(route, { a1: 1, b1: 1, c1: 1 }, 0)).toBe(3);
	});

	it('is null when every island is sailed — the way on is the summary', () => {
		expect(nextIslandIndex(route, { a1: 1, b1: 1, c1: 1, d1: 1 }, 1)).toBeNull();
	});

	it('does not offer the island the player is standing on', () => {
		expect(nextIslandIndex([route[0]], {}, 0)).toBeNull();
		expect(nextIslandIndex([], {}, 0)).toBeNull();
	});
});
