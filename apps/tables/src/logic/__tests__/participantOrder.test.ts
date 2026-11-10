import { describe, expect, it } from 'vitest';
import { orderTopics } from '../ranking';
import {
	loadOrder,
	orderStorageKey,
	parseOrder,
	participantTopicOrder,
	reconcileOrder,
	shuffleIds,
	sortByOrder,
} from '../participantOrder';
import type { RandomSource } from '../participantOrder';

function sequence(values: number[]): RandomSource {
	let index = 0;

	return () => values[index++ % values.length];
}

type MemoryStorage = Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> };

function memoryStorage(): MemoryStorage {
	const data = new Map<string, string>();

	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
	};
}

const topic = (topicId: string): { topicId: string } => ({ topicId });
const ids = (list: { topicId: string }[]): string[] => list.map((item) => item.topicId);

describe('shuffleIds', () => {
	it('is a permutation and does not change the input', () => {
		const input = ['a', 'b', 'c', 'd', 'e'];
		const out = shuffleIds(input, sequence([0.1, 0.9, 0.5, 0.3]));

		expect([...out].sort()).toEqual(input);
		expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('gives different orders for different random draws', () => {
		const input = ['a', 'b', 'c', 'd'];

		expect(shuffleIds(input, () => 0)).not.toEqual(shuffleIds(input, () => 0.99));
	});
});

describe('reconcileOrder', () => {
	it('shuffles when nothing is stored', () => {
		const out = reconcileOrder(null, ['a', 'b', 'c'], Math.random);

		expect([...out].sort()).toEqual(['a', 'b', 'c']);
	});

	it('keeps the stored order untouched when the tables did not change', () => {
		expect(reconcileOrder(['c', 'a', 'b'], ['a', 'b', 'c'], () => 0.5)).toEqual(['c', 'a', 'b']);
	});

	it('drops removed tables and inserts new ones at a random position', () => {
		expect(reconcileOrder(['c', 'a', 'b'], ['a', 'b', 'd'], () => 0)).toEqual(['d', 'a', 'b']);
		expect(reconcileOrder(['c', 'a', 'b'], ['a', 'b', 'd'], () => 0.99)).toEqual(['a', 'b', 'd']);
	});

	it('ignores duplicate stored ids', () => {
		expect(reconcileOrder(['a', 'a', 'b'], ['a', 'b'], () => 0)).toEqual(['a', 'b']);
	});
});

describe('sortByOrder', () => {
	it('sorts by the order and puts unknown tables last', () => {
		const sorted = sortByOrder([topic('a'), topic('b'), topic('c')], ['c', 'a']);

		expect(ids(sorted)).toEqual(['c', 'a', 'b']);
	});
});

describe('participantTopicOrder', () => {
	const topics = [topic('a'), topic('b'), topic('c'), topic('d')];

	it('remembers the first shuffle and returns it again', () => {
		const storage = memoryStorage();
		const first = ids(
			participantTopicOrder(topics, 's1', 'u1', storage, sequence([0.3, 0.7, 0.1])),
		);
		const again = ids(participantTopicOrder(topics, 's1', 'u1', storage, () => 0.99));

		expect([...first].sort()).toEqual(['a', 'b', 'c', 'd']);
		expect(again).toEqual(first);
		expect(loadOrder('s1', 'u1', storage)).toEqual(first);
	});

	it('keeps separate orders per session and person', () => {
		const storage = memoryStorage();

		participantTopicOrder(topics, 's1', 'u1', storage, () => 0);
		participantTopicOrder(topics, 's1', 'u2', storage, () => 0.99);

		expect(storage.data.size).toBe(2);
		expect(orderStorageKey('s1', 'u1')).not.toBe(orderStorageKey('s1', 'u2'));
	});

	it('merges added tables and drops removed ones, then remembers', () => {
		const storage = memoryStorage();

		storage.setItem(orderStorageKey('s1', 'u1'), JSON.stringify(['c', 'a', 'b']));

		const changed = [topic('a'), topic('b'), topic('d')];
		const out = ids(participantTopicOrder(changed, 's1', 'u1', storage, () => 0.99));

		expect(out).toEqual(['a', 'b', 'd']);
		expect(loadOrder('s1', 'u1', storage)).toEqual(['a', 'b', 'd']);
	});

	it('recovers from a corrupt stored value', () => {
		const storage = memoryStorage();

		storage.setItem(orderStorageKey('s1', 'u1'), '{nope');

		expect(parseOrder('{nope')).toBeNull();
		expect(ids(participantTopicOrder(topics, 's1', 'u1', storage)).sort()).toEqual([
			'a',
			'b',
			'c',
			'd',
		]);
	});

	it('leaves picked tables first, the rest in the person order', () => {
		const storage = memoryStorage();

		storage.setItem(orderStorageKey('s1', 'u1'), JSON.stringify(['d', 'c', 'b', 'a']));

		const own = participantTopicOrder(topics, 's1', 'u1', storage);

		expect(ids(orderTopics(own, ['b']))).toEqual(['b', 'd', 'c', 'a']);
	});
});
