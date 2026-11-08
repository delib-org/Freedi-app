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

describe('computeTableCount', () => {
	it('returns 0 tables for no students and 1 for a tiny class', () => {
		expect(computeTableCount(0)).toBe(0);
		expect(computeTableCount(1)).toBe(1);
		expect(computeTableCount(2)).toBe(1);
		expect(computeTableCount(3)).toBe(1);
	});

	it('keeps every table inside 2..8 for every size 2..8 and every class of 2 to 80', () => {
		for (let size = MIN_TABLE_SIZE; size <= MAX_TABLE_SIZE; size++) {
			for (let n = 2; n <= 80; n++) {
				const t = computeTableCount(n, size);
				expect(Math.floor(n / t)).toBeGreaterThanOrEqual(MIN_TABLE_SIZE);
				expect(Math.ceil(n / t)).toBeLessThanOrEqual(MAX_TABLE_SIZE);
			}
		}
	});

	it('defaults to a table size of 6', () => {
		expect(computeTableCount(24)).toBe(4);
		expect(computeTableCount(13)).toBe(2);
		expect(computeTableCount(12)).toBe(2);
	});

	it('aims at size 2', () => {
		expect(computeTableCount(10, 2)).toBe(5);
		expect(computeTableCount(11, 2)).toBe(5);
		expect(computeTableCount(5, 2)).toBe(2);
		expect(computeTableCount(3, 2)).toBe(1);
	});

	it('aims at size 6 without leaving a table of one', () => {
		expect(computeTableCount(13, 6)).toBe(2);
		expect(computeTableCount(7, 6)).toBe(1);
		expect(computeTableCount(9, 6)).toBe(2);
		expect(computeTableCount(19, 6)).toBe(3);
		expect(computeTableCount(31, 6)).toBe(5);
	});

	it('aims at size 8', () => {
		expect(computeTableCount(24, 8)).toBe(3);
		expect(computeTableCount(9, 8)).toBe(2);
		expect(computeTableCount(8, 8)).toBe(1);
		expect(computeTableCount(16, 8)).toBe(2);
		expect(computeTableCount(17, 8)).toBe(3);
		expect(computeTableCount(25, 8)).toBe(4);
	});

	it('aims at the other sizes too', () => {
		expect(computeTableCount(24, 4)).toBe(6);
		expect(computeTableCount(24, 3)).toBe(8);
		expect(computeTableCount(25, 5)).toBe(5);
	});
});

describe('assignStudents', () => {
	it('seats everyone exactly once with sizes 2..8 that differ by at most one', () => {
		for (const size of [2, 6, 8]) {
			for (let n = 3; n <= 60; n++) {
				const third = Math.floor(n / 3);
				const students = makeClass(third, third, n - 2 * third);
				const tables = assignStudents(students, size, seededRng(n));
				const seated = tables.flatMap((t) => t.memberUids);
				expect(seated.sort()).toEqual(students.map((s) => s.uid).sort());
				const sizes = tables.map((t) => t.memberUids.length);
				expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_TABLE_SIZE);
				expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_TABLE_SIZE);
				expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
			}
		}
	});

	it('13 students at size 6 sit at two tables of 6 and 7', () => {
		const tables = assignStudents(makeClass(5, 4, 4), 6, seededRng());
		expect(tables.map((t) => t.memberUids.length).sort()).toEqual([6, 7]);
	});

	it('uses the default size (6) when none is given', () => {
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
