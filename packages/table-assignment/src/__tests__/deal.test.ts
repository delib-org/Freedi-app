import { dealSnake } from '../deal';
import { createRng } from '../rng';
import { TableAssignmentError } from '../errors';
import type { Participant, TablePlan } from '../types';

const plans: TablePlan[] = [
	{ topicId: 'a', size: 3 },
	{ topicId: 'b', size: 3 },
	{ topicId: 'c', size: 3 },
];

const spectrum: Participant[] = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, side: [i * 10], preferences: [] }));

describe('dealSnake', () => {
	it('fills every seat exactly once', () => {
		const seating = dealSnake(spectrum, plans, [], createRng(1));
		expect(seating.map((t) => t.length)).toEqual([3, 3, 3]);
		expect(seating.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it('gives every table a low, a middle and a high side', () => {
		const seating = dealSnake(spectrum, plans, [], createRng(1));
		for (const members of seating) {
			const sides = members.map((i) => spectrum[i].side?.[0] ?? -1).sort((a, b) => a - b);
			expect(sides[0]).toBeLessThan(30);
			expect(sides[2]).toBeGreaterThan(50);
		}
	});

	it('keeps pinned participants at their table and deals only the rest', () => {
		const seating = dealSnake(spectrum, plans, [[], [], [0, 8]], createRng(1));
		expect(seating[2].slice(0, 2)).toEqual([0, 8]);
		expect(seating.map((t) => t.length)).toEqual([3, 3, 3]);
		expect(seating.flat().sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it('throws when pinned seats leave no free seat for the rest', () => {
		expect(() => dealSnake(spectrum, plans, [[0, 1, 2], [3, 4, 5]], createRng(1))).not.toThrow();
		expect(() => dealSnake(spectrum, [{ topicId: 'a', size: 3 }], [[0, 1]], createRng(1))).toThrow(TableAssignmentError);
	});

	it('seats undeclared participants too', () => {
		const mixed = spectrum.map((p, i) => (i % 2 ? { ...p, side: undefined } : p));
		const seating = dealSnake(mixed, plans, [], createRng(1));
		expect(seating.flat()).toHaveLength(9);
	});
});
