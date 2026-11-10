import { assignTables } from '../assignTables';
import { SWAP_TRIES_DEFAULT } from '../constants';
import { makeCrowd, makeTopics } from './crowd';

const TOPICS = makeTopics(8);
const SEED = 3;
const MEDIUM_ROOM = 150;
const LARGE_ROOM = 600;
const TINY_BUDGET = 20_000;
const FAST_ENOUGH_MS = 20_000;

describe('swap budget', () => {
	it('gives the same room for the same seed and budget', () => {
		const crowd = makeCrowd({ n: LARGE_ROOM, topics: TOPICS, undeclared: 0.1, noPreference: 0.1, seed: SEED, continuous: true });
		const first = assignTables(crowd, TOPICS, { seed: SEED, maxSwapTries: TINY_BUDGET });
		const second = assignTables(crowd, TOPICS, { seed: SEED, maxSwapTries: TINY_BUDGET });
		expect(second).toEqual(first);
	});

	it('returns a full seating even when the budget is spent at once', () => {
		const crowd = makeCrowd({ n: LARGE_ROOM, topics: TOPICS, undeclared: 0.1, noPreference: 0.1, seed: SEED, continuous: true });
		for (const maxSwapTries of [0, 1, TINY_BUDGET]) {
			const result = assignTables(crowd, TOPICS, { seed: SEED, maxSwapTries });
			const seated = result.tables.flatMap((table) => table.memberIds).sort();
			expect(seated).toEqual(crowd.map((p) => p.id).sort());
		}
	});

	it('finishes a large continuous crowd quickly under a small budget', () => {
		const crowd = makeCrowd({ n: LARGE_ROOM, topics: TOPICS, undeclared: 0.1, noPreference: 0.1, seed: SEED, continuous: true });
		const started = Date.now();
		assignTables(crowd, TOPICS, { seed: SEED, maxSwapTries: TINY_BUDGET });
		expect(Date.now() - started).toBeLessThan(FAST_ENOUGH_MS);
	});

	it('does not change the result of a crowd the default budget already covers', () => {
		const crowd = makeCrowd({ n: MEDIUM_ROOM, topics: TOPICS, undeclared: 0.1, noPreference: 0.1, seed: SEED, continuous: true });
		const byDefault = assignTables(crowd, TOPICS, { seed: SEED });
		const unlimited = assignTables(crowd, TOPICS, { seed: SEED, maxSwapTries: Number.MAX_SAFE_INTEGER });
		expect(byDefault).toEqual(unlimited);
	});

	it('has a default large enough for a few hundred people', () => {
		expect(SWAP_TRIES_DEFAULT).toBeGreaterThan(10_000_000);
	});
});
