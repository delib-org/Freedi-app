import { allocateTables } from '../allocateTables';
import { TableAssignmentError } from '../errors';
import type { Participant, Topic } from '../types';

const topics: Topic[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function crowd(count: number, preferences: string[]): Participant[] {
	return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, preferences }));
}

describe('allocateTables', () => {
	it('returns no tables for an empty crowd', () => {
		expect(allocateTables([], topics, 7, 3)).toEqual([]);
	});

	it('opens as few tables as seat everyone and spreads sizes evenly', () => {
		const plans = allocateTables(crowd(22, ['a']), topics, 7, 3);
		expect(plans.map((p) => p.size)).toEqual([6, 6, 5, 5]);
	});

	it('gives tables to topics in proportion to weighted demand', () => {
		const participants = [...crowd(14, ['a']), ...crowd(7, ['b'])];
		const plans = allocateTables(participants, topics, 7, 3);
		expect(plans.filter((p) => p.topicId === 'a')).toHaveLength(2);
		expect(plans.filter((p) => p.topicId === 'b')).toHaveLength(1);
		expect(plans.filter((p) => p.topicId === 'c')).toHaveLength(0);
	});

	it('does not open a table for a topic nobody put first', () => {
		const participants = [...crowd(7, ['a', 'b']), ...crowd(7, ['a', 'c'])];
		const plans = allocateTables(participants, topics, 7, 3);
		expect(plans.map((p) => p.topicId).sort()).toEqual(['a', 'a']);
	});

	it('lets second choices break a tie between first choices', () => {
		const participants = [...crowd(7, ['a']), ...crowd(7, ['b']), ...crowd(1, ['c', 'b'])];
		const plans = allocateTables(participants, topics, 7, 3);
		expect(plans.map((p) => p.topicId).sort()).toEqual(['a', 'b', 'b']);
	});

	it('opens unwanted topics only when every wanted topic is capped', () => {
		const capped: Topic[] = [{ id: 'a', maxTables: 1 }, { id: 'b' }];
		const plans = allocateTables(crowd(14, ['a']), capped, 7, 3);
		expect(plans.map((p) => p.topicId).sort()).toEqual(['a', 'b']);
	});

	it('respects maxTables and hands the surplus to other topics', () => {
		const capped: Topic[] = [{ id: 'a', maxTables: 1 }, { id: 'b' }];
		const participants = [...crowd(20, ['a']), ...crowd(1, ['b'])];
		const plans = allocateTables(participants, capped, 7, 3);
		expect(plans.filter((p) => p.topicId === 'a')).toHaveLength(1);
		expect(plans.filter((p) => p.topicId === 'b')).toHaveLength(2);
	});

	it('throws when the caps cannot seat everyone', () => {
		const capped: Topic[] = [{ id: 'a', maxTables: 1 }];
		expect(() => allocateTables(crowd(8, ['a']), capped, 7, 3)).toThrow(TableAssignmentError);
	});

	it('shares tables evenly when nobody stated a preference', () => {
		const plans = allocateTables(crowd(21, []), topics, 7, 3);
		expect(plans.map((p) => p.topicId).sort()).toEqual(['a', 'b', 'c']);
	});

	it('ignores preferences for unknown topics', () => {
		const plans = allocateTables(crowd(7, ['zzz']), topics, 7, 3);
		expect(plans).toHaveLength(1);
	});
});
