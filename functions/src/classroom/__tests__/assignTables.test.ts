import { assignStudents, computeTableCount, SeatableStudent } from '../assignTables';
import { MAX_TABLE_SIZE, MIN_TABLE_SIZE } from '@freedi/shared-types';
import type { Camp } from '@freedi/shared-types';

/** Deterministic rng: a fixed linear congruential sequence. */
function seededRng(seed = 42): () => number {
	let state = seed;

	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;

		return state / 4294967296;
	};
}

function makeClass(a: number, center: number, b: number, unknown = 0): SeatableStudent[] {
	const out: SeatableStudent[] = [];
	const push = (
		camp: Camp | undefined,
		side: number | undefined,
		count: number,
		tag: string,
	): void => {
		for (let i = 0; i < count; i++) {
			out.push({ uid: `${tag}${i}`, camp, side });
		}
	};
	push('a', 10, a, 'a');
	push('center', 50, center, 'c');
	push('b', 90, b, 'b');
	push(undefined, undefined, unknown, 'u');

	return out;
}

describe('computeTableCount (the size is a maximum, IA tables-class-bridge 2.2)', () => {
	it('returns 0 tables for no students and 1 for a tiny class', () => {
		expect(computeTableCount(0)).toBe(0);
		expect(computeTableCount(1)).toBe(1);
		expect(computeTableCount(2)).toBe(1);
		expect(computeTableCount(3)).toBe(1);
	});

	it('opens ceil(n / size) tables, never above the size and never a table of one, for 3..20', () => {
		for (let size = MIN_TABLE_SIZE; size <= MAX_TABLE_SIZE; size++) {
			for (let n = 2; n <= 120; n++) {
				const t = computeTableCount(n, size);
				expect(t).toBe(Math.ceil(n / size));
				expect(Math.ceil(n / t)).toBeLessThanOrEqual(size);
				expect(Math.floor(n / t)).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('defaults to at most 7 a table', () => {
		expect(computeTableCount(28)).toBe(4);
		expect(computeTableCount(29)).toBe(5);
		expect(computeTableCount(7)).toBe(1);
		expect(computeTableCount(8)).toBe(2);
	});

	it('31 students at 6 sit at 6 tables (it was a target of 6, giving a table of 7)', () => {
		expect(computeTableCount(31, 6)).toBe(6);
		expect(computeTableCount(13, 6)).toBe(3);
	});

	it('runs a table of 20', () => {
		expect(computeTableCount(20, 20)).toBe(1);
		expect(computeTableCount(21, 20)).toBe(2);
		expect(computeTableCount(41, 20)).toBe(3);
	});

	it('still runs an older lesson saved with 2 without leaving anyone alone', () => {
		expect(computeTableCount(10, 2)).toBe(5);
		expect(computeTableCount(3, 2)).toBe(1);
		expect(computeTableCount(5, 2)).toBe(2);
	});
});

describe('assignStudents', () => {
	it('seats everyone exactly once at tables of 2..size that differ by at most one', () => {
		for (const size of [MIN_TABLE_SIZE, 6, 8, MAX_TABLE_SIZE]) {
			for (let n = 3; n <= 60; n++) {
				const third = Math.floor(n / 3);
				const students = makeClass(third, third, n - 2 * third);
				const tables = assignStudents(students, size, seededRng(n));
				const seated = tables.flatMap((t) => t.memberUids);
				expect(seated.sort()).toEqual(students.map((s) => s.uid).sort());
				const sizes = tables.map((t) => t.memberUids.length);
				expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
				expect(Math.max(...sizes)).toBeLessThanOrEqual(size);
				expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
			}
		}
	});

	it('13 students at size 6 sit at three tables of 4 and 5', () => {
		const tables = assignStudents(makeClass(5, 4, 4), 6, seededRng());
		expect(tables.map((t) => t.memberUids.length).sort()).toEqual([4, 4, 5]);
	});

	it('uses the default size (at most 7) when none is given', () => {
		expect(assignStudents(makeClass(8, 8, 8), undefined, seededRng())).toHaveLength(4);
	});

	it('mixes the sides: with enough of each camp, every table has an a and a b', () => {
		const students = makeClass(8, 8, 8);
		const tables = assignStudents(students, 4, seededRng());
		expect(tables).toHaveLength(6);
		for (const t of tables) {
			expect(t.memberUids.some((u) => u.startsWith('a'))).toBe(true);
			expect(t.memberUids.some((u) => u.startsWith('b'))).toBe(true);
		}
	});

	it('fills tables without an a with the b camp first when a is scarce', () => {
		const students = makeClass(2, 6, 4);
		const tables = assignStudents(students, 4, seededRng());
		expect(tables).toHaveLength(3);
		// every table has at least one pole student
		for (const t of tables) {
			expect(t.memberUids.some((u) => u.startsWith('a') || u.startsWith('b'))).toBe(true);
		}
	});

	it('spreads the centre and the students without a side', () => {
		const students = makeClass(4, 6, 4, 2);
		const tables = assignStudents(students, 4, seededRng());
		const centreCounts = tables.map(
			(t) => t.memberUids.filter((u) => u.startsWith('c') || u.startsWith('u')).length,
		);
		expect(Math.max(...centreCounts) - Math.min(...centreCounts)).toBeLessThanOrEqual(1);
	});

	it('numbers tables from 1 and seats nobody as asker', () => {
		const tables = assignStudents(makeClass(4, 4, 4), 4, seededRng());
		expect(tables.map((t) => t.n)).toEqual([1, 2, 3]);
		for (const t of tables) expect(t).not.toHaveProperty('askerUid');
	});

	it('ignores duplicate uids and returns nothing for an empty class', () => {
		expect(assignStudents([], 4)).toEqual([]);
		const one: SeatableStudent = { uid: 'x', camp: 'a', side: 1 };
		const tables = assignStudents([one, one, { ...one, uid: 'y' }], 4);
		expect(tables).toHaveLength(1);
		expect(tables[0].memberUids.sort()).toEqual(['x', 'y']);
	});

	it('gives a different plan with a different random source (re-seat)', () => {
		const students = makeClass(8, 8, 8);
		const first = assignStudents(students, 4, seededRng(1)).map((t) => t.memberUids.join(','));
		const second = assignStudents(students, 4, seededRng(99)).map((t) => t.memberUids.join(','));
		expect(first).not.toEqual(second);
	});
});
