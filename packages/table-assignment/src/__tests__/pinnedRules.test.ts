import { assignTables } from '../assignTables';
import { MIN_OPENED_TABLE_SIZE } from '../constants';
import type { Assignment, Participant, PinnedTable, Topic } from '../types';

const TABLE_SIZE = 7;
const SEED = 3;

function people(prefix: string, count: number, preferences: string[]): Participant[] {
	return Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, preferences }));
}

function ids(prefix: string, count: number): string[] {
	return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

function tableOf(result: Assignment, id: string): number {
	return result.tables.findIndex((table) => table.memberIds.includes(id));
}

function run(everyone: Participant[], topics: Topic[], pinnedTables: PinnedTable[]): Assignment {
	return assignTables(everyone, topics, { seed: SEED, tableSize: TABLE_SIZE, pinnedTables });
}

function seatedIds(result: Assignment): string[] {
	return result.tables.flatMap((table) => table.memberIds).sort();
}

const TOPICS: Topic[] = ['t0', 't1', 't2', 't3'].map((id) => ({ id }));

describe('pinned seats go only to people who ranked the topic', () => {
	it('does not put newcomers at a pinned table of a topic they never ranked', () => {
		const pinned = [{ topicId: 't0', memberIds: ids('m', 3) }];
		const everyone = [...people('m', 3, ['t0']), ...people('n', 30, ['t3'])];
		const result = run(everyone, TOPICS, pinned);
		expect(result.tables[0].memberIds).toHaveLength(3);
		expect(result.tables.slice(1).every((table) => table.topicId === 't3')).toBe(true);
		expect(seatedIds(result)).toEqual(everyone.map((p) => p.id).sort());
	});

	it('seats a lone latecomer of a full topic at a free seat elsewhere, not alone', () => {
		const pinned = [
			{ topicId: 't0', memberIds: ids('a', TABLE_SIZE) },
			{ topicId: 't1', memberIds: ids('b', 3) },
		];
		const everyone = [...people('a', TABLE_SIZE, ['t0']), ...people('b', 3, ['t1']), ...people('late', 1, ['t0'])];
		const result = run(everyone, TOPICS, pinned);
		expect(result.tables).toHaveLength(2);
		expect(tableOf(result, 'late0')).toBe(1);
	});

	it('gives a newcomer with no preferences a seat only after those who ranked the topic', () => {
		const pinned = [
			{ topicId: 't0', memberIds: ids('a', TABLE_SIZE - 1) },
			{ topicId: 't1', memberIds: ids('b', TABLE_SIZE - 1) },
		];
		const everyone = [
			...people('a', TABLE_SIZE - 1, ['t0']),
			...people('b', TABLE_SIZE - 1, ['t1']),
			{ id: 'blank', preferences: [] },
			{ id: 'wants', preferences: ['t0'] },
		];
		const result = run(everyone, TOPICS, pinned);
		expect(result.tables).toHaveLength(2);
		expect(tableOf(result, 'wants')).toBe(0);
		expect(tableOf(result, 'blank')).toBe(1);
	});

	it('opens a table for leftovers only when there are enough of them', () => {
		const pinned = [{ topicId: 't0', memberIds: ids('a', TABLE_SIZE) }];
		const enough = [...people('a', TABLE_SIZE, ['t0']), ...people('n', MIN_OPENED_TABLE_SIZE, ['t0'])];
		const opened = run(enough, TOPICS, pinned);
		expect(opened.tables).toHaveLength(2);
		expect(opened.tables[1].topicId).toBe('t0');
		const few = [...people('a', TABLE_SIZE, ['t0']), ...people('n', MIN_OPENED_TABLE_SIZE - 1, ['t0'])];
		expect(run(few, TOPICS, pinned).tables).toHaveLength(2);
		expect(run(few, TOPICS, pinned).tables[1].memberIds).toHaveLength(MIN_OPENED_TABLE_SIZE - 1);
	});

	it('still counts pinned tables against maxTables', () => {
		const capped: Topic[] = [{ id: 't0', maxTables: 1 }, { id: 't1' }];
		const pinned = [{ topicId: 't0', memberIds: ids('a', TABLE_SIZE) }];
		const everyone = [...people('a', TABLE_SIZE, ['t0']), ...people('n', 5, ['t0'])];
		const result = run(everyone, capped, pinned);
		expect(result.tables.filter((table) => table.topicId === 't0')).toHaveLength(1);
		expect(seatedIds(result)).toEqual(everyone.map((p) => p.id).sort());
	});

	it('falls back to free pinned seats when caps forbid a new table', () => {
		const capped: Topic[] = [{ id: 't0', maxTables: 1 }, { id: 't1', maxTables: 1 }];
		const pinned = [
			{ topicId: 't0', memberIds: ids('a', TABLE_SIZE) },
			{ topicId: 't1', memberIds: ids('b', 2) },
		];
		const everyone = [...people('a', TABLE_SIZE, ['t0']), ...people('b', 2, ['t1']), ...people('n', 4, ['t0'])];
		const result = run(everyone, capped, pinned);
		expect(result.tables).toHaveLength(2);
		expect(seatedIds(result)).toEqual(everyone.map((p) => p.id).sort());
	});

	it('keeps a pinned table whose members all left and refills it by topic', () => {
		const pinned = [{ topicId: 't2', memberIds: ['ghost1', 'ghost2'] }];
		const everyone = people('n', 3, ['t2']);
		const result = run(everyone, TOPICS, pinned);
		expect(result.tables[0].topicId).toBe('t2');
		expect(result.tables[0].memberIds.sort()).toEqual(ids('n', 3));
		expect(result.tables).toHaveLength(1);
	});
});
