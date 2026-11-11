import { assignTables } from '../assignTables';
import { improveBySwaps } from '../improve';
import { createRng } from '../rng';
import { sideStats } from '../stats';
import type { Participant, TablePlan } from '../types';
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

	describe('search phases', () => {
		const LOW = 0;
		const HIGH = 100;
		const TOLERANCE = 0.3;
		const MAX_RANKED = 3;
		const plans: TablePlan[] = [
			{ topicId: 'x', size: 2 },
			{ topicId: 'y', size: 2 },
		];
		// The x lovers are both low, the y lovers both high: preferences want them apart by side.
		const people: Participant[] = [
			{ id: 'a', side: [LOW], preferences: ['x'] },
			{ id: 'b', side: [LOW], preferences: ['x'] },
			{ id: 'c', side: [HIGH], preferences: ['y'] },
			{ id: 'd', side: [HIGH], preferences: ['y'] },
		];
		const options = { maxRanked: MAX_RANKED, tolerance: TOLERANCE, locked: new Set<number>(), maxSwapTries: Number.MAX_SAFE_INTEGER };

		it('takes a balance-repairing swap even when it costs preference points', () => {
			const seating = [[0, 1], [2, 3]];
			const score = improveBySwaps(people, plans, seating, sideStats(people), options, createRng(1));
			expect(score.maxDeviation).toBeLessThanOrEqual(TOLERANCE);
			expect(score.preferenceScore).toBeLessThan(people.length * MAX_RANKED);
		});

		it('never lets the preference phase raise the worst deviation', () => {
			const seating = [[0, 2], [1, 3]];
			const before = improveBySwaps(people, plans, [[0, 2], [1, 3]], sideStats(people), { ...options, maxSwapTries: 0 }, createRng(1));
			const after = improveBySwaps(people, plans, seating, sideStats(people), options, createRng(1));
			expect(after.maxDeviation).toBeLessThanOrEqual(Math.max(before.maxDeviation, TOLERANCE));
			expect(after.maxDeviation).toBeLessThanOrEqual(TOLERANCE);
		});
	});
});
