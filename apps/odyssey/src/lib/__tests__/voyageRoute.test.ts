import { describe, expect, it } from 'vitest';
import { initialRouteSelection, nextIslandIndex, routeStops, sailedCount } from '../voyageRoute';

function island(statementId: string, stanceIds: string[]) {
	return { statementId, stances: stanceIds.map((id) => ({ statementId: id })) };
}

const route = [
	island('i1', ['a1', 'a2']),
	island('i2', ['b1', 'b2']),
	island('i3', ['c1']),
	island('i4', ['d1']),
];

describe('routeStops', () => {
	it('marks done, current and open', () => {
		const stops = routeStops(route, { a1: 1, c1: 0 }, 1);
		expect(stops.map((stop) => stop.status)).toEqual(['done', 'current', 'done', 'open']);
		expect(stops.map((stop) => stop.index)).toEqual([0, 1, 2, 3]);
	});

	it('the island under the player is current even when it already has an answer', () => {
		expect(routeStops(route, { a1: 1 }, 0)[0].status).toBe('current');
	});

	it('counts sailed islands', () => {
		expect(sailedCount(route, {})).toBe(0);
		expect(sailedCount(route, { a1: 1, c1: 0 })).toBe(2);
	});
});

describe('nextIslandIndex', () => {
	it('goes to the following island, in order', () => {
		expect(nextIslandIndex(route, { a1: 1 }, 0)).toBe(1);
		expect(nextIslandIndex(route, { a1: 1, b1: 1 }, 1)).toBe(2);
	});

	it('walks a fresh re-sail through islands that already have answers', () => {
		// voyageStartIndex opens a fresh voyage on island 1 for the same reason.
		expect(nextIslandIndex(route, { a1: 1, b1: 1, c1: 1, d1: 1 }, 0)).toBe(1);
	});

	it('returns from the last island to an island skipped earlier', () => {
		// Jumped from i1 to i4 via the strip: i2 and i3 still wait.
		expect(nextIslandIndex(route, { a1: 1, d1: 1 }, 3)).toBe(1);
		expect(nextIslandIndex(route, { a1: 1, b1: 1, d1: 1 }, 3)).toBe(2);
	});

	it('is null after the last island when everything is sailed — the way on is the summary', () => {
		expect(nextIslandIndex(route, { a1: 1, b1: 1, c1: 1, d1: 1 }, 3)).toBeNull();
	});

	it('handles a one-island route and an empty one', () => {
		expect(nextIslandIndex([route[0]], {}, 0)).toBeNull();
		expect(nextIslandIndex([], {}, 0)).toBeNull();
	});
});

describe('initialRouteSelection', () => {
	it('opens with nothing chosen on a voyage not yet begun', () => {
		expect(initialRouteSelection(['i1', 'i2'], route, {})).toEqual([]);
		expect(initialRouteSelection(undefined, route, {})).toEqual([]);
		expect(initialRouteSelection([], route, { a1: 1 })).toEqual([]);
	});

	it('keeps a route the player has started sailing', () => {
		expect(initialRouteSelection(['i1', 'i2'], route, { a1: 1 })).toEqual(['i1', 'i2']);
	});

	it('an answer on an island outside the saved route does not count as having begun', () => {
		expect(initialRouteSelection(['i2'], route, { a1: 1 })).toEqual([]);
	});

	it('drops ids of islands that no longer exist', () => {
		expect(initialRouteSelection(['i1', 'gone'], route, { a1: 1 })).toEqual(['i1']);
	});
});
