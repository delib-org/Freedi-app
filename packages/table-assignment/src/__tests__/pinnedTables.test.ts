import { assignTables } from '../assignTables';
import { TableAssignmentError } from '../errors';
import type { Assignment, Participant, PinnedTable, Topic } from '../types';
import { makeCrowd, makeTopics } from './crowd';

const TOPICS = makeTopics(4);
const TABLE_SIZE = 6;
const FIRST_ROOM = 45;
const LATECOMERS = 15;
const SEED = 7;

function room(n: number, from = 0): Participant[] {
	return makeCrowd({ n, topics: TOPICS, undeclared: 0.1, noPreference: 0.1, seed: SEED + from })
		.map((p, i) => ({ ...p, id: `p${from + i}` }));
}

/** What a host would store after publishing: each table's topic and members. */
function pinnedFrom(result: Assignment): PinnedTable[] {
	return result.tables.map((table) => ({ topicId: table.topicId, memberIds: table.memberIds }));
}

function tableOf(result: Assignment, id: string): number {
	return result.tables.findIndex((table) => table.memberIds.includes(id));
}

describe('pinned tables', () => {
	const first = assignTables(room(FIRST_ROOM), TOPICS, { seed: SEED, tableSize: TABLE_SIZE });
	const everyone = [...room(FIRST_ROOM), ...room(LATECOMERS, FIRST_ROOM)];

	it('keeps every seated person at the same table, topic and position when latecomers register', () => {
		const second = assignTables(everyone, TOPICS, { seed: SEED + 1, tableSize: TABLE_SIZE, pinnedTables: pinnedFrom(first) });
		first.tables.forEach((table, t) => {
			expect(second.tables[t].topicId).toBe(table.topicId);
			expect(second.tables[t].memberIds.slice(0, table.memberIds.length)).toEqual(table.memberIds);
		});
		const seated = second.tables.flatMap((table) => table.memberIds).sort();
		expect(seated).toEqual(everyone.map((p) => p.id).sort());
		expect(second.tables.every((table) => table.memberIds.length <= TABLE_SIZE)).toBe(true);
	});

	it('opens a new table only when the pinned tables are full', () => {
		const pinned = pinnedFrom(first);
		const freeSeats = pinned.reduce((total, table) => total + TABLE_SIZE - table.memberIds.length, 0);
		const few = room(Math.max(1, freeSeats), FIRST_ROOM);
		const filled = assignTables([...room(FIRST_ROOM), ...few], TOPICS, { seed: SEED, tableSize: TABLE_SIZE, pinnedTables: pinned });
		expect(filled.tables).toHaveLength(first.tables.length);
		const one = room(freeSeats + 1, FIRST_ROOM);
		const opened = assignTables([...room(FIRST_ROOM), ...one], TOPICS, { seed: SEED, tableSize: TABLE_SIZE, pinnedTables: pinned });
		expect(opened.tables.length).toBeGreaterThan(first.tables.length);
		expect(opened.tables.slice(0, first.tables.length).every((t) => t.memberIds.length === TABLE_SIZE)).toBe(true);
	});

	it('seats newcomers at a pinned table of a topic they ranked when there is room', () => {
		const pinned: PinnedTable[] = [
			{ topicId: 't0', memberIds: ['a1', 'a2'] },
			{ topicId: 't1', memberIds: ['b1', 'b2'] },
		];
		const people: Participant[] = [
			...['a1', 'a2', 'b1', 'b2'].map((id) => ({ id, preferences: [] })),
			{ id: 'n1', preferences: ['t1'] },
			{ id: 'n2', preferences: ['t1'] },
		];
		const result = assignTables(people, [{ id: 't0' }, { id: 't1' }], { seed: 1, tableSize: TABLE_SIZE, pinnedTables: pinned });
		expect(result.tables).toHaveLength(2);
		expect(tableOf(result, 'n1')).toBe(1);
		expect(tableOf(result, 'n2')).toBe(1);
	});

	it('drops pinned members who left but keeps the table and its place', () => {
		const pinned = pinnedFrom(first);
		const gone = pinned[0].memberIds[0];
		const stayed = everyone.filter((p) => p.id !== gone);
		const result = assignTables(stayed, TOPICS, { seed: SEED, tableSize: TABLE_SIZE, pinnedTables: pinned });
		expect(result.tables[0].topicId).toBe(pinned[0].topicId);
		expect(result.tables.flatMap((t) => t.memberIds)).not.toContain(gone);
		expect(result.tables[0].memberIds.slice(0, pinned[0].memberIds.length - 1)).toEqual(pinned[0].memberIds.slice(1));
	});

	it('gives the same room for the same seed', () => {
		const options = { seed: SEED, tableSize: TABLE_SIZE, pinnedTables: pinnedFrom(first) };
		expect(assignTables(everyone, TOPICS, options)).toEqual(assignTables(everyone, TOPICS, options));
	});

	it('works without pinned tables exactly as before', () => {
		const plain = assignTables(everyone, TOPICS, { seed: SEED, tableSize: TABLE_SIZE });
		expect(assignTables(everyone, TOPICS, { seed: SEED, tableSize: TABLE_SIZE, pinnedTables: [] })).toEqual(plain);
	});

	it('rejects a member pinned at two tables, an oversize table and an unknown topic', () => {
		const people = room(10);
		const twice: PinnedTable[] = [
			{ topicId: 't0', memberIds: ['p0', 'p1'] },
			{ topicId: 't1', memberIds: ['p1'] },
		];
		const oversize: PinnedTable[] = [{ topicId: 't0', memberIds: people.slice(0, TABLE_SIZE + 1).map((p) => p.id) }];
		const unknown: PinnedTable[] = [{ topicId: 'nope', memberIds: ['p0'] }];
		for (const pinnedTables of [twice, oversize, unknown]) {
			expect(() => assignTables(people, TOPICS, { seed: 1, tableSize: TABLE_SIZE, pinnedTables })).toThrow(TableAssignmentError);
		}
	});

	it('balances the newcomers around the pinned members', () => {
		const topics: Topic[] = [{ id: 'x' }];
		const pinnedLow = Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, side: [0], preferences: ['x'] }));
		const pinnedHigh = Array.from({ length: 4 }, (_, i) => ({ id: `h${i}`, side: [100], preferences: ['x'] }));
		const newcomers = [
			...Array.from({ length: 4 }, (_, i) => ({ id: `nl${i}`, side: [0], preferences: ['x'] })),
			...Array.from({ length: 4 }, (_, i) => ({ id: `nh${i}`, side: [100], preferences: ['x'] })),
		];
		const pinned: PinnedTable[] = [
			{ topicId: 'x', memberIds: pinnedLow.map((p) => p.id) },
			{ topicId: 'x', memberIds: pinnedHigh.map((p) => p.id) },
		];
		const result = assignTables([...pinnedLow, ...pinnedHigh, ...newcomers], topics, { seed: 1, tableSize: 8, pinnedTables: pinned });
		expect(result.tables[0].memberIds).toEqual(expect.arrayContaining(pinned[0].memberIds));
		expect(result.tables[1].memberIds).toEqual(expect.arrayContaining(pinned[1].memberIds));
		expect(result.metrics.balance.withinTolerance).toBe(true);
	});
});
