import type { Participant, PinnedTable, TablePlan, Topic } from './types';
import { allocateTables, topicDemand } from './allocateTables';
import { TableAssignmentError } from './errors';

export interface PinnedLayout {
	/** Pinned tables first, in the order given, then any tables opened for newcomers. */
	plans: TablePlan[];
	/** Participant indexes sitting at each plan (empty for tables opened for newcomers). */
	pinnedSeats: number[][];
}

/**
 * Tables for a re-run that keeps the room as it is. Pinned members stay put.
 * Newcomers first fill the free seats of pinned tables (spread over topics by
 * what they asked for); only the people who do not fit there open new tables.
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
	const sizes = pinnedSeats.map((members) => members.length);
	const freeSeats = sizes.reduce((total, size) => total + (tableSize - size), 0);
	const topicIds = pinnedTables.map((table) => table.topicId);
	const toPinned = Math.min(newcomers.length, freeSeats);

	fillPinnedSeats(sizes, topicIds, newcomers, topics, tableSize, maxRanked, toPinned);
	const plans: TablePlan[] = topicIds.map((topicId, t) => ({ topicId, size: sizes[t] }));
	const opened = allocateTables(newcomers, topics, tableSize, maxRanked, {
		seats: newcomers.length - toPinned,
		tablesPerTopic: countPerTopic(topicIds),
	});

	return { plans: [...plans, ...opened], pinnedSeats: [...pinnedSeats, ...opened.map(() => [])] };
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

/**
 * Hands `count` newcomer seats to pinned tables, one at a time (highest
 * average method over topics, so a topic's share follows what newcomers asked
 * for). Inside a topic the emptiest table gets the next seat. Grows `sizes`.
 */
function fillPinnedSeats(
	sizes: number[],
	topicIds: readonly string[],
	newcomers: readonly Participant[],
	topics: readonly Topic[],
	tableSize: number,
	maxRanked: number,
	count: number,
): void {
	const weight = new Map(
		topicDemand(newcomers, topics, maxRanked).map((entry) => [entry.topicId, entry.weight]),
	);
	const given = new Map<string, number>();
	for (let seat = 0; seat < count; seat++) {
		let best = -1;
		let bestScore = -1;
		for (let t = 0; t < sizes.length; t++) {
			if (sizes[t] >= tableSize) continue;
			const score = (weight.get(topicIds[t]) ?? 0) / (1 + (given.get(topicIds[t]) ?? 0));
			if (best < 0 || score > bestScore || (score === bestScore && sizes[t] < sizes[best])) {
				best = t;
				bestScore = score;
			}
		}
		sizes[best]++;
		given.set(topicIds[best], (given.get(topicIds[best]) ?? 0) + 1);
	}
}

function countPerTopic(topicIds: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const id of topicIds) counts.set(id, (counts.get(id) ?? 0) + 1);

	return counts;
}
