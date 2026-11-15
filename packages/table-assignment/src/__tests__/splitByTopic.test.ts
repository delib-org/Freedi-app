import { emptiestTableWithSeat, splitByChosenTopic } from '../splitByTopic';
import type { Participant } from '../types';

const SIDE_STEP = 25;
const SIDE_STOPS = 5;

function sideOf(i: number): number {
	return (i % SIDE_STOPS) * SIDE_STEP;
}

function crowd(counts: Record<string, number>, withSides = false): Participant[] {
	return Object.entries(counts).flatMap(([topicId, count]) =>
		Array.from({ length: count }, (_, i) => ({
			id: `${topicId}-${i}`,
			preferences: [topicId],
			side: withSides ? [sideOf(i)] : undefined,
		})),
	);
}

function sizesOf(tables: { topicId: string; memberIds: string[] }[], topicId: string): number[] {
	return tables
		.filter((t) => t.topicId === topicId)
		.map((t) => t.memberIds.length)
		.sort((a, b) => a - b);
}

describe('splitByChosenTopic', () => {
	it('opens ceil(n / size) balanced tables per topic and keeps everyone in their topic', () => {
		const people = crowd({ water: 71, roads: 15, parks: 3 });
		const { tables, unseatedIds, topicsWithOnePerson } = splitByChosenTopic(
			people,
			['water', 'roads', 'parks'],
			{ tableSize: 7, seed: 1 },
		);

		expect(sizesOf(tables, 'water')).toEqual([6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7]);
		expect(sizesOf(tables, 'roads')).toEqual([5, 5, 5]);
		expect(sizesOf(tables, 'parks')).toEqual([3]);
		for (const table of tables) {
			expect(table.memberIds.every((id) => id.startsWith(`${table.topicId}-`))).toBe(true);
		}
		expect(unseatedIds).toEqual([]);
		expect(topicsWithOnePerson).toEqual([]);
	});

	it('numbers the tables through the topics in the host order, one topic next to the other', () => {
		const { tables } = splitByChosenTopic(crowd({ b: 9, a: 9 }), ['a', 'b'], {
			tableSize: 5,
			seed: 3,
		});

		expect(tables.map((t) => [t.index, t.topicId])).toEqual([
			[0, 'a'],
			[1, 'a'],
			[2, 'b'],
			[3, 'b'],
		]);
	});

	it('opens no table for a topic nobody chose', () => {
		const { tables } = splitByChosenTopic(crowd({ a: 4 }), ['a', 'empty'], { tableSize: 7 });

		expect(tables.map((t) => t.topicId)).toEqual(['a']);
	});

	it('flags a topic one person chose and moves nobody', () => {
		const { tables, topicsWithOnePerson } = splitByChosenTopic(
			crowd({ a: 6, lone: 1 }),
			['a', 'lone'],
			{ tableSize: 7 },
		);

		expect(topicsWithOnePerson).toEqual(['lone']);
		expect(tables.find((t) => t.topicId === 'lone')?.memberIds).toEqual(['lone-0']);
	});

	it('leaves out people with no choice or an unknown topic', () => {
		const people: Participant[] = [
			...crowd({ a: 3 }),
			{ id: 'none', preferences: [] },
			{ id: 'gone', preferences: ['deleted'] },
		];
		const { tables, unseatedIds } = splitByChosenTopic(people, ['a'], { tableSize: 7 });

		expect([...unseatedIds].sort()).toEqual(['gone', 'none']);
		expect(tables.flatMap((t) => t.memberIds)).toHaveLength(3);
	});

	it('mixes positions inside a topic', () => {
		const { tables } = splitByChosenTopic(crowd({ a: 20 }, true), ['a'], {
			tableSize: 10,
			seed: 7,
		});

		for (const table of tables) {
			const sides = table.memberIds.map((id) => sideOf(Number(id.split('-')[1])));
			expect(Math.min(...sides)).toBe(0);
			expect(Math.max(...sides)).toBe(100);
		}
	});

	it('handles tables of 20', () => {
		const { tables } = splitByChosenTopic(crowd({ a: 41 }), ['a'], { tableSize: 20, seed: 1 });

		expect(sizesOf(tables, 'a')).toEqual([13, 14, 14]);
	});
});

describe('emptiestTableWithSeat', () => {
	const tables = [
		{ index: 0, topicId: 'a', memberCount: 7 },
		{ index: 1, topicId: 'a', memberCount: 6 },
		{ index: 2, topicId: 'a', memberCount: 6 },
		{ index: 3, topicId: 'b', memberCount: 2 },
	];

	it('picks the emptiest table of the topic, the lowest number on a tie', () => {
		expect(emptiestTableWithSeat(tables, 'a', 7)).toBe(1);
	});

	it('answers undefined when every table of the topic is full or the topic has none', () => {
		expect(emptiestTableWithSeat(tables, 'a', 6)).toBeUndefined();
		expect(emptiestTableWithSeat(tables, 'c', 7)).toBeUndefined();
	});
});
