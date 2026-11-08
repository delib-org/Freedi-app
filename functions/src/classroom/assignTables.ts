import {
	DEFAULT_TABLE_SIZE,
	MAX_NO_DEVICE_PER_TABLE,
	MAX_TABLE_SIZE,
	MIN_TABLE_SIZE,
} from '@freedi/shared-types';
import type { Camp, ClassTable, NoDeviceMember } from '@freedi/shared-types';

/**
 * Pure seating algorithm behind `classAssignTables`.
 *
 * Every table mixes the sides: students are dealt round-robin, camp by camp,
 * with the deal index carried across camps — so the first 'b' student lands on
 * the first table that got no 'a', and the centre (plus students who never
 * picked a side) is spread last over whatever is left. Table sizes differ by
 * at most one and always stay inside MIN_TABLE_SIZE..MAX_TABLE_SIZE (2..8), so
 * no table is ever left with one student, except for a class of 1 student
 * (one small table is the only possible answer). The size the teacher wants
 * (default 6) only decides how many tables.
 */

export interface SeatableStudent {
	uid: string;
	/** Camp from the Side step; missing = never picked a side (dealt with the centre). */
	camp?: Camp;
	/** Slider value 0..100, orders students inside a camp (extremes first). */
	side?: number;
}

export interface SeatedTable {
	/** 1-based table number */
	n: number;
	memberUids: string[];
}

/** Random source in [0, 1); injectable so tests are deterministic. */
export type Rng = () => number;

/**
 * Number of tables for `count` students aiming at `size` per table: the valid
 * count (every table 2..8) closest to count/size; ties go to fewer tables.
 */
export function computeTableCount(count: number, size: number = DEFAULT_TABLE_SIZE): number {
	if (count <= 0) return 0;
	if (count < MIN_TABLE_SIZE) return 1;
	const target = count / size;
	let best = 0;
	for (let t = 1; t <= count; t++) {
		const valid = Math.floor(count / t) >= MIN_TABLE_SIZE && Math.ceil(count / t) <= MAX_TABLE_SIZE;
		if (!valid) continue;
		if (best === 0 || Math.abs(t - target) < Math.abs(best - target)) best = t;
	}

	return best;
}

function shuffled<T>(items: T[], rng: Rng): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}

	return out;
}

/**
 * Order inside one camp. Shuffle first (so "re-seat" gives a new table plan),
 * then a stable sort by distance from the middle: the most convinced students
 * of each side are spread first, one per table.
 */
function campOrder(students: SeatableStudent[], rng: Rng): SeatableStudent[] {
	const MIDDLE = 50;
	const distance = (s: SeatableStudent): number =>
		typeof s.side === 'number' ? Math.abs(s.side - MIDDLE) : 0;

	return shuffled(students, rng).sort((x, y) => distance(y) - distance(x));
}

export function assignStudents(
	students: SeatableStudent[],
	size: number = DEFAULT_TABLE_SIZE,
	rng: Rng = Math.random,
): SeatedTable[] {
	const unique = [...new Map(students.map((s) => [s.uid, s])).values()];
	const tableCount = computeTableCount(unique.length, size);
	if (tableCount === 0) return [];

	const byCamp = (camp: Camp | undefined): SeatableStudent[] =>
		unique.filter((s) => (camp === 'center' ? !s.camp || s.camp === 'center' : s.camp === camp));
	const deck = [
		...campOrder(byCamp('a'), rng),
		...campOrder(byCamp('b'), rng),
		...campOrder(byCamp('center'), rng),
	];

	const buckets: SeatableStudent[][] = Array.from({ length: tableCount }, () => []);
	deck.forEach((student, i) => buckets[i % tableCount].push(student));

	// Nobody asks first by seating: the first student who taps "אני אשאל" does.
	return buckets.map((members, k) => ({ n: k + 1, memberUids: members.map((s) => s.uid) }));
}

/**
 * Where the no-device students sit after a re-seat. Their proposals and votes hang on
 * their ids, so nobody is ever dropped: each stays at their table number when it still
 * exists and has room, the rest go to the table with the fewest. Fewer tables than the
 * cap can hold is the one case a table goes over it: losing a student would be worse.
 */
export function carryNoDeviceMembers(
	oldTables: readonly Pick<ClassTable, 'n' | 'noDeviceMembers'>[],
	newTableNumbers: readonly number[],
): Map<number, NoDeviceMember[]> {
	const placed = new Map<number, NoDeviceMember[]>(newTableNumbers.map((n) => [n, []]));
	const waiting: NoDeviceMember[] = [];
	for (const table of [...oldTables].sort((x, y) => x.n - y.n)) {
		for (const member of table.noDeviceMembers ?? []) {
			const seat = placed.get(table.n);
			if (seat && seat.length < MAX_NO_DEVICE_PER_TABLE) seat.push(member);
			else waiting.push(member);
		}
	}
	for (const member of waiting) {
		const emptiest = [...placed.values()].reduce((best, seat) =>
			seat.length < best.length ? seat : best,
		);
		emptiest.push(member);
	}

	return placed;
}
