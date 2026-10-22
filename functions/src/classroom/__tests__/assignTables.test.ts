import { assignStudents, computeTableCount, SeatableStudent } from '../assignTables';
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
	});

	it('keeps every table inside 3..5 for every class size from 3 to 40', () => {
		for (const size of [3, 4, 5]) {
			for (let n = 3; n <= 40; n++) {
				const t = computeTableCount(n, size);
				expect(Math.floor(n / t)).toBeGreaterThanOrEqual(3);
				expect(Math.ceil(n / t)).toBeLessThanOrEqual(5);
			}
		}
	});

	it('aims at the requested size', () => {
		expect(computeTableCount(24, 4)).toBe(6);
		expect(computeTableCount(24, 3)).toBe(8);
		expect(computeTableCount(25, 5)).toBe(5);
		expect(computeTableCount(7, 4)).toBe(2);
		expect(computeTableCount(6, 5)).toBe(2);
	});
});

describe('assignStudents', () => {
	it('seats everyone exactly once with sizes 3..5 that differ by at most one', () => {
		for (let n = 3; n <= 36; n++) {
			const students = makeClass(Math.floor(n / 3), Math.floor(n / 3), n - 2 * Math.floor(n / 3));
			const tables = assignStudents(students, 4, seededRng(n));
			const seated = tables.flatMap((t) => t.memberUids);
			expect(seated.sort()).toEqual(students.map((s) => s.uid).sort());
			const sizes = tables.map((t) => t.memberUids.length);
			expect(Math.min(...sizes)).toBeGreaterThanOrEqual(3);
			expect(Math.max(...sizes)).toBeLessThanOrEqual(5);
			expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
		}
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
