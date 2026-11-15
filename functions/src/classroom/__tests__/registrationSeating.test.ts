import type { ClassTable, LessonPlan } from '@freedi/shared-types';
import { newTable } from '../assignTables';
import type { RegistrationSeatDoc } from '../registration/registrationAccess';
import { pickWalkInTable, planCopySeating } from '../registration/registrationSeating';
import type { CopyInput } from '../registration/registrationSeating';
import { planWithSide, planWithoutSide } from '../registration/registrationSteps';

/** Copying the seating, walk-ins, no-shows and no phone (IA tables-class-bridge 5.3, 5.4). */

const MAIN = 'lesson';
const NOW = 1_800_000_000_000;

function seatIds(): () => string {
	let next = 0;

	return () => `seat-${next++}`;
}

function input(overrides: Partial<CopyInput> = {}): CopyInput {
	return {
		mainId: MAIN,
		sessionId: 'sess',
		now: NOW,
		runTables: [
			{ index: 0, topicId: 'water', memberUids: ['r1', 'r2', 'r3'] },
			{ index: 1, topicId: 'roads', memberUids: ['r4', 'r5'] },
		],
		topicTitles: new Map([
			['water', 'Water'],
			['roads', 'Roads'],
		]),
		names: new Map(['r1', 'r2', 'r3', 'r4', 'r5'].map((r) => [r, `Name ${r}`])),
		ledger: [],
		walkInUids: [],
		oldTables: [],
		seatsPerTable: 4,
		newSeatId: seatIds(),
		...overrides,
	};
}

function arrived(registrationUid: string, classUid: string): RegistrationSeatDoc {
	return {
		mainId: MAIN,
		sessionId: 'sess',
		registrationUid,
		fullName: `Name ${registrationUid}`,
		nameKey: `name ${registrationUid}`,
		seatId: `known-${registrationUid}`,
		classUid,
		arrivedAt: NOW - 1,
	};
}

const byN = (tables: ClassTable[], n: number): ClassTable =>
	tables.find((t) => t.n === n) as ClassTable;

describe('planCopySeating', () => {
	it('keeps the table numbers and topics, seats who arrived and reserves the rest by name', () => {
		const plan = planCopySeating(input({ ledger: [arrived('r2', 'c2')] }));

		expect(plan.tables.map((t) => [t.n, t.topic])).toEqual([
			[1, 'Water'],
			[2, 'Roads'],
		]);
		expect(byN(plan.tables, 1).memberUids).toEqual(['c2']);
		expect(byN(plan.tables, 1).reservedSeats?.map((s) => s.name)).toEqual(['Name r1', 'Name r3']);
		expect(byN(plan.tables, 2).reservedSeats).toHaveLength(2);
		expect([plan.arrived, plan.reserved]).toEqual([1, 4]);
		expect(plan.seatOf.get('c2')).toBe(1);
		// A known seat keeps its id; new ones get one.
		expect(plan.ledger.find((d) => d.registrationUid === 'r2')).toMatchObject({
			seatId: 'known-r2',
			classUid: 'c2',
			tableN: 1,
			topic: 'Water',
		});
		expect(plan.ledger.find((d) => d.registrationUid === 'r1')).toMatchObject({
			seatId: expect.stringMatching(/^seat-/),
			tableN: 1,
		});
	});

	it('shows no topic line in a one-topic event', () => {
		const plan = planCopySeating(input({ topicTitles: undefined }));

		expect(plan.tables.every((t) => t.topic === undefined)).toBe(true);
	});

	it('seats walk-ins at the table with the fewest taken seats, reserved seats counted as taken', () => {
		const plan = planCopySeating(input({ walkInUids: ['w1', 'w2', 'w3'] }));

		// Table 1 has 3 reserved, table 2 has 2: w1 goes to 2; at 3 and 3, w2 takes the lower
		// number; table 1 is then full, so w3 goes to 2.
		expect(byN(plan.tables, 2).memberUids).toEqual(['w1', 'w3']);
		expect(byN(plan.tables, 1).memberUids).toEqual(['w2']);
		expect([plan.walkInsSeated, plan.withoutTable]).toEqual([3, 0]);
	});

	it('leaves walk-ins without a table when every seat is taken, and moves nobody to make room', () => {
		const plan = planCopySeating(input({ walkInUids: ['w1', 'w2', 'w3', 'w4'], seatsPerTable: 3 }));

		expect(byN(plan.tables, 1).memberUids).toEqual([]);
		expect(byN(plan.tables, 2).memberUids).toEqual(['w1']);
		expect([plan.walkInsSeated, plan.withoutTable]).toEqual([1, 3]);
		expect(plan.seatOf.has('w2')).toBe(false);
	});

	it('keeps a no-show as a reserved seat, never a member (no turn, no "move on")', () => {
		const plan = planCopySeating(input());

		expect(plan.tables.flatMap((t) => t.memberUids)).toEqual([]);
		expect(plan.tables.flatMap((t) => t.reservedSeats ?? [])).toHaveLength(5);
	});

	it('keeps a registered person without a phone at their registration table', () => {
		const withoutPhone = { id: 'nd_r4', name: 'Name r4' };
		const old = newTable(MAIN, 1, [], NOW, [withoutPhone]);
		const ledger: RegistrationSeatDoc[] = [
			{ ...arrived('r4', 'unused'), classUid: undefined, noDeviceId: 'nd_r4' },
		];
		const plan = planCopySeating(input({ ledger, oldTables: [old] }));

		expect(byN(plan.tables, 2).noDeviceMembers).toEqual([withoutPhone]);
		expect(byN(plan.tables, 1).noDeviceMembers).toEqual([]);
		expect(byN(plan.tables, 2).reservedSeats?.map((s) => s.name)).toEqual(['Name r5']);
	});

	it('carries other people without a phone to their table number', () => {
		const old = newTable(MAIN, 2, [], NOW, [{ id: 'nd_x', name: 'X' }]);
		const plan = planCopySeating(input({ oldTables: [old] }));

		expect(byN(plan.tables, 2).noDeviceMembers.map((m) => m.id)).toEqual(['nd_x']);
	});

	it('seats an arrival the published tables do not seat like a walk-in, before other walk-ins', () => {
		const plan = planCopySeating(
			input({ ledger: [arrived('late', 'c-late')], walkInUids: ['w1'], seatsPerTable: 4 }),
		);

		// The late arrival takes the emptiest table first; the walk-in comes after.
		expect(byN(plan.tables, 2).memberUids).toEqual(['c-late']);
		expect(byN(plan.tables, 1).memberUids).toEqual(['w1']);
		expect(plan.ledger.find((d) => d.registrationUid === 'late')?.tableN).toBeUndefined();
	});
});

describe('pickWalkInTable', () => {
	it('counts people without a phone and reserved seats as taken; lowest number on a tie', () => {
		const t1 = { ...newTable(MAIN, 1, ['a'], NOW), reservedSeats: [{ seatId: 's', name: 'S' }] };
		const t2 = newTable(MAIN, 2, ['b'], NOW, [{ id: 'nd', name: 'N' }]);
		const t3 = newTable(MAIN, 3, ['c'], NOW);

		expect(pickWalkInTable([t1, t2, t3], 3)?.n).toBe(3);
		expect(pickWalkInTable([t1, t2], 3)?.n).toBe(1);
		expect(pickWalkInTable([t1, t2], 2)).toBeUndefined();
	});
});

describe('the side step of a connected lesson (IA 2.5)', () => {
	const plan: LessonPlan = {
		steps: ['waiting', 'opening', 'side', 'tables', 'tableTalk'],
		stepIndex: 0,
	};

	it('takes side out and keeps the room on its step', () => {
		expect(planWithoutSide(plan)).toEqual({
			steps: ['waiting', 'opening', 'tables', 'tableTalk'],
			stepIndex: 0,
		});
		expect(planWithoutSide({ ...plan, stepIndex: 3 })?.stepIndex).toBe(2);
		expect(planWithoutSide({ ...plan, steps: ['waiting', 'tables'] })).toBeUndefined();
	});

	it('puts side back before the tables', () => {
		const without = planWithoutSide({ ...plan, stepIndex: 1 }) as LessonPlan;

		expect(planWithSide(without)).toEqual({ ...plan, stepIndex: 1 });
		expect(planWithSide(plan)).toBe(plan);
	});
});
