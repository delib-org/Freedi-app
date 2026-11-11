import type { Participant, TablePlan } from './types';
import type { Rng } from './rng';
import { shuffle } from './rng';
import { TableAssignmentError } from './errors';

/** Seating as the search works on it: tables[t] holds participant indexes. */
export type Seating = number[][];

/**
 * Participant indexes already sitting at each table (by plan index) that a
 * deal must keep and never move. Missing entries mean nobody is pinned there.
 */
export type PinnedSeats = ReadonlyArray<readonly number[]>;

/**
 * First seating, balance only: declared participants sorted along their side
 * and dealt in a snake (1..k, k..1, ...) so every table gets a slice of each
 * part of the spectrum. Undeclared participants fill the gaps at random.
 * Pinned seats are taken first; only the other participants are dealt.
 */
export function dealSnake(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	pinned: PinnedSeats,
	rng: Rng,
): Seating {
	const seating: Seating = plans.map((_, t) => [...(pinned[t] ?? [])]);
	const taken = new Set(seating.flat());
	const free = participants.flatMap((_, i) => (taken.has(i) ? [] : [i]));
	const declared = free.filter((i) => participants[i].side !== undefined);
	const undeclared = shuffle(
		free.filter((i) => participants[i].side === undefined),
		rng,
	);

	sortAlongSide(declared, participants, rng);
	const tableOrder = shuffle(
		plans.map((_, t) => t),
		rng,
	);
	dealInSnake([...declared, ...undeclared], tableOrder, plans, seating);

	return seating;
}

/** Sort by the first axis, then the next; ties fall in lottery order. */
function sortAlongSide(indexes: number[], participants: readonly Participant[], rng: Rng): void {
	shuffle(indexes, rng);
	indexes.sort((a, b) => compareSides(participants[a].side ?? [], participants[b].side ?? []));
}

function compareSides(a: readonly number[], b: readonly number[]): number {
	for (let axis = 0; axis < Math.min(a.length, b.length); axis++) {
		if (a[axis] !== b[axis]) return a[axis] - b[axis];
	}

	return 0;
}

function dealInSnake(
	queue: readonly number[],
	tableOrder: readonly number[],
	plans: readonly TablePlan[],
	seating: Seating,
): void {
	let cursor = 0;
	let direction = 1;
	for (const participant of queue) {
		let tried = 0;
		while (seating[tableOrder[cursor]].length >= plans[tableOrder[cursor]].size) {
			({ cursor, direction } = step(cursor, direction, tableOrder.length));
			if (++tried > 2 * tableOrder.length) {
				throw new TableAssignmentError('No free seat left while dealing', { participant });
			}
		}
		seating[tableOrder[cursor]].push(participant);
		({ cursor, direction } = step(cursor, direction, tableOrder.length));
	}
}

/** Serpentine: at either end the direction flips and the end table is dealt twice in a row. */
function step(
	cursor: number,
	direction: number,
	tables: number,
): { cursor: number; direction: number } {
	const next = cursor + direction;
	if (next < 0 || next >= tables) return { cursor, direction: -direction };

	return { cursor: next, direction };
}
