import type { Participant, PinnedTable, TablePlan, Topic } from './types';
import { allocateTables } from './allocateTables';
import { MIN_OPENED_TABLE_SIZE } from './constants';
import { TableAssignmentError } from './errors';

export interface PinnedLayout {
	/** Pinned tables first, in the order given, then any tables opened for newcomers. */
	plans: TablePlan[];
	/** Participant indexes sitting at each plan (empty for tables opened for newcomers). */
	pinnedSeats: number[][];
}

/**
 * Tables for a re-run that keeps the room as it is. Pinned members stay put.
 *
 * 1. A newcomer takes a free seat at a pinned table only of a topic they
 *    ranked (best choice first); a newcomer with no preferences then takes
 *    any seat still free.
 * 2. Those left over open new tables at the topics they ranked, as a normal
 *    run would, when they are enough for a table (MIN_OPENED_TABLE_SIZE).
 * 3. Fewer than that take any free pinned seat rather than sit alone; only
 *    with no free seat anywhere do they open a (small) table.
 */
export function layoutWithPinned(
	participants: readonly Participant[],
	topics: readonly Topic[],
	pinnedTables: readonly PinnedTable[],
	tableSize: number,
	maxRanked: number,
): PinnedLayout {
	const pinnedSeats = seatPinned(participants, topics, pinnedTables, tableSize);
	const seated = new Set(pinnedSeats.flat());
	const newcomers = participants.filter((_, i) => !seated.has(i));
	const topicIds = pinnedTables.map((table) => table.topicId);
	const sizes = pinnedSeats.map((members) => members.length);

	const unmatched = takeRankedSeats(newcomers, topicIds, sizes, tableSize, maxRanked);
	const withoutPreferences = unmatched.filter((p) => p.preferences.length === 0);
	let leftover = unmatched.filter((p) => p.preferences.length > 0);
	leftover = [...leftover, ...takeAnySeats(withoutPreferences, sizes, tableSize)];

	let opened: TablePlan[] = [];
	if (leftover.length >= MIN_OPENED_TABLE_SIZE) {
		opened = tryOpenTables(leftover, topics, topicIds, tableSize, maxRanked) ?? [];
		if (opened.length > 0) leftover = [];
	}
	if (leftover.length > 0) {
		leftover = takeAnySeats(leftover, sizes, tableSize);
		opened =
			leftover.length > 0 ? openTables(leftover, topics, topicIds, tableSize, maxRanked) : [];
	}
	const plans: TablePlan[] = topicIds.map((topicId, t) => ({ topicId, size: sizes[t] }));

	return { plans: [...plans, ...opened], pinnedSeats: [...pinnedSeats, ...opened.map(() => [])] };
}

/** Rank by rank, gives newcomers a free seat at a pinned table of that topic (emptiest first). Returns who got none. */
function takeRankedSeats(
	newcomers: readonly Participant[],
	topicIds: readonly string[],
	sizes: number[],
	tableSize: number,
	maxRanked: number,
): Participant[] {
	let waiting = [...newcomers];
	for (let rank = 0; rank < maxRanked; rank++) {
		waiting = waiting.filter((person) => {
			const topicId = person.preferences[rank];
			if (topicId === undefined) return true;
			const table = emptiestTable(sizes, tableSize, (t) => topicIds[t] === topicId);

			if (table < 0) return true;
			sizes[table]++;

			return false;
		});
	}

	return waiting;
}

/** Gives each person any free pinned seat (emptiest table first). Returns who found none. */
function takeAnySeats(
	people: readonly Participant[],
	sizes: number[],
	tableSize: number,
): Participant[] {
	const unseated: Participant[] = [];
	for (const person of people) {
		const table = emptiestTable(sizes, tableSize, () => true);
		if (table < 0) unseated.push(person);
		else sizes[table]++;
	}

	return unseated;
}

function emptiestTable(
	sizes: readonly number[],
	tableSize: number,
	wanted: (t: number) => boolean,
): number {
	let best = -1;
	for (let t = 0; t < sizes.length; t++) {
		if (sizes[t] >= tableSize || !wanted(t)) continue;
		if (best < 0 || sizes[t] < sizes[best]) best = t;
	}

	return best;
}

function openTables(
	people: readonly Participant[],
	topics: readonly Topic[],
	topicIds: readonly string[],
	tableSize: number,
	maxRanked: number,
): TablePlan[] {
	return allocateTables(people, topics, tableSize, maxRanked, {
		seats: people.length,
		tablesPerTopic: countPerTopic(topicIds),
	});
}

/** Like openTables, but undefined when topic caps leave no room (the caller then uses free pinned seats). */
function tryOpenTables(
	people: readonly Participant[],
	topics: readonly Topic[],
	topicIds: readonly string[],
	tableSize: number,
	maxRanked: number,
): TablePlan[] | undefined {
	try {
		return openTables(people, topics, topicIds, tableSize, maxRanked);
	} catch (error) {
		if (error instanceof TableAssignmentError) return undefined;
		throw error;
	}
}

/** Participant indexes of each pinned table's members who are still in the room. */
function seatPinned(
	participants: readonly Participant[],
	topics: readonly Topic[],
	pinnedTables: readonly PinnedTable[],
	tableSize: number,
): number[][] {
	const topicIds = new Set(topics.map((topic) => topic.id));
	const indexById = new Map(participants.map((participant, i) => [participant.id, i]));
	const pinnedIds = new Set<string>();

	return pinnedTables.map((table) => {
		if (!topicIds.has(table.topicId))
			throw new TableAssignmentError('A pinned table has an unknown topic', {
				topicId: table.topicId,
			});
		if (table.memberIds.length > tableSize)
			throw new TableAssignmentError('A pinned table is larger than tableSize', {
				topicId: table.topicId,
				members: table.memberIds.length,
				tableSize,
			});
		const seats: number[] = [];
		for (const id of table.memberIds) {
			if (pinnedIds.has(id))
				throw new TableAssignmentError('A member is pinned at more than one table', { id });
			pinnedIds.add(id);
			const index = indexById.get(id);
			if (index !== undefined) seats.push(index);
		}

		return seats;
	});
}

function countPerTopic(topicIds: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const id of topicIds) counts.set(id, (counts.get(id) ?? 0) + 1);

	return counts;
}
