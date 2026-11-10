import { assignTables } from '../assignTables';
import { makeCrowd, makeTopics } from './crowd';

const SEEDS = 12;
const TOPIC_COUNT = 8;
const UNDECLARED = 0.5;
const NO_PREFERENCE = 0.1;
const SAME_SEED = 5;
const SMALL_ROOM = 60;

function outOfTolerance(n: number): number {
	const topics = makeTopics(TOPIC_COUNT);
	let out = 0;
	for (let seed = 1; seed <= SEEDS; seed++) {
		const crowd = makeCrowd({ n, topics, undeclared: UNDECLARED, noPreference: NO_PREFERENCE, seed });
		const result = assignTables(crowd, topics, { seed });
		if (!result.metrics.balance.withinTolerance) out++;
	}

	return out;
}

describe('balance first', () => {
	// Before the balance-only phase 22 of 25 seeds were out of tolerance at n = 100, and 17 of 25 at n = 200.
	it('brings most crowds with half undeclared inside tolerance at n = 100', () => {
		expect(outOfTolerance(100)).toBeLessThanOrEqual(SEEDS / 2);
	});

	it('does the same at n = 40', () => {
		expect(outOfTolerance(40)).toBeLessThanOrEqual(SEEDS / 2);
	});

	it('keeps the same seed giving the same room', () => {
		const topics = makeTopics(TOPIC_COUNT);
		const crowd = makeCrowd({ n: SMALL_ROOM, topics, undeclared: UNDECLARED, noPreference: NO_PREFERENCE, seed: SAME_SEED });
		expect(assignTables(crowd, topics, { seed: SAME_SEED })).toEqual(assignTables(crowd, topics, { seed: SAME_SEED }));
	});

	it('still seats everyone exactly once', () => {
		const topics = makeTopics(TOPIC_COUNT);
		const crowd = makeCrowd({ n: SMALL_ROOM, topics, undeclared: UNDECLARED, noPreference: NO_PREFERENCE, seed: SAME_SEED });
		const ids = assignTables(crowd, topics, { seed: SAME_SEED }).tables.flatMap((t) => t.memberIds);
		expect(ids.sort()).toEqual(crowd.map((p) => p.id).sort());
	});
});
