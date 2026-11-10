import { assignTables } from '../assignTables';
import { TableAssignmentError } from '../errors';
import type { Participant, Topic } from '../types';

const topics: Topic[] = [{ id: 'water' }, { id: 'roads' }, { id: 'parks' }];

/** 42 people on a 0..100 spectrum, each wanting the topic of their "side". */
function partisanCrowd(): Participant[] {
	return Array.from({ length: 42 }, (_, i) => {
		const side = Math.round((i / 41) * 100);
		const preferences = side < 50 ? ['water', 'parks', 'roads'] : ['roads', 'parks', 'water'];

		return { id: `p${i}`, side: [side], preferences };
	});
}

describe('assignTables', () => {
	it('seats everyone exactly once at tables no larger than tableSize', () => {
		const participants = partisanCrowd();
		const { tables } = assignTables(participants, topics, { seed: 1 });
		const seated = tables.flatMap((t) => t.memberIds);
		expect(seated.sort()).toEqual(participants.map((p) => p.id).sort());
		expect(tables.every((t) => t.memberIds.length <= 7)).toBe(true);
	});

	it('keeps every table a mirror of the crowd within tolerance', () => {
		const result = assignTables(partisanCrowd(), topics, { seed: 1, balanceTolerance: 0.3 });
		expect(result.metrics.balance.withinTolerance).toBe(true);
		for (const table of result.tables) expect(table.stats.deviation).toBeLessThanOrEqual(0.3);
	});

	it('gives most people a topic they asked for while staying balanced', () => {
		const { metrics } = assignTables(partisanCrowd(), topics, { seed: 1 });
		expect(metrics.preferences.none).toBe(0);
		// Each balanced table must seat both halves, and each half wants a different topic.
		expect(metrics.preferences.byRank[0]).toBeGreaterThanOrEqual(18);
	});

	it('satisfies preferences fully when balance is not asked for', () => {
		const participants = partisanCrowd().map((p) => ({ ...p, side: undefined }));
		const { metrics } = assignTables(participants, topics, { seed: 1 });
		expect(metrics.preferences.byRank[0]).toBe(42);
		expect(metrics.balance.max).toBe(0);
	});

	it('is deterministic for a seed and reports it', () => {
		const participants = partisanCrowd();
		const once = assignTables(participants, topics, { seed: 99 });
		const again = assignTables(participants, topics, { seed: 99 });
		expect(once.seed).toBe(99);
		expect(again.tables).toEqual(once.tables);
	});

	it('handles the simple mode: one choice each, no sides', () => {
		const participants: Participant[] = Array.from({ length: 10 }, (_, i) => ({
			id: `p${i}`,
			preferences: [i < 7 ? 'water' : 'roads'],
		}));
		const { tables, metrics } = assignTables(participants, topics, { seed: 1, tableSize: 5 });
		expect(tables).toHaveLength(2);
		expect(metrics.preferences.none).toBeLessThanOrEqual(2);
	});

	it('counts people without preferences separately', () => {
		const participants: Participant[] = [
			{ id: 'a', preferences: ['water'] },
			{ id: 'b', preferences: [] },
		];
		const { metrics } = assignTables(participants, topics, { seed: 1 });
		expect(metrics.preferences.noPreference).toBe(1);
		expect(metrics.preferences.maxScore).toBe(3);
	});

	it('returns no tables for nobody', () => {
		expect(assignTables([], topics, { seed: 1 }).tables).toEqual([]);
	});

	it('rejects duplicate ids, mixed axes, bad sizes and missing topics', () => {
		const twice: Participant[] = [{ id: 'a', preferences: [] }, { id: 'a', preferences: [] }];
		expect(() => assignTables(twice, topics, { seed: 1 })).toThrow(TableAssignmentError);
		const mixedAxes: Participant[] = [{ id: 'a', side: [1], preferences: [] }, { id: 'b', side: [1, 2], preferences: [] }];
		expect(() => assignTables(mixedAxes, topics, { seed: 1 })).toThrow(TableAssignmentError);
		expect(() => assignTables(partisanCrowd(), topics, { seed: 1, tableSize: 0 })).toThrow(TableAssignmentError);
		expect(() => assignTables(partisanCrowd(), [], { seed: 1 })).toThrow(TableAssignmentError);
	});

	it('balances on two axes at once', () => {
		const participants: Participant[] = Array.from({ length: 28 }, (_, i) => ({
			id: `p${i}`,
			side: [(i % 7) * 16, (i % 4) * 33],
			preferences: ['water', 'roads'],
		}));
		const { metrics } = assignTables(participants, topics, { seed: 1 });
		expect(metrics.population.mean).toHaveLength(2);
		expect(metrics.balance.withinTolerance).toBe(true);
	});
});
