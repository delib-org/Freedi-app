import type { AssignedTable, AssignmentOptions, Participant } from './types';
import { assignTables } from './assignTables';
import { TableAssignmentError } from './errors';

/**
 * "Sit where you like" with tables made by the system (IA tables-class-bridge
 * 2.1, 2.3). Each person chose one topic (`preferences[0]`); nobody is ever
 * moved out of it. A topic of n people opens ceil(n / tableSize) tables whose
 * sizes differ by at most one, so with tableSize >= 3 no table of one comes out
 * unless one person chose the topic. Inside a topic the engine still mixes
 * declared positions, exactly as a one-topic ranked run would.
 */

export type SplitOptions = Pick<
	AssignmentOptions,
	'tableSize' | 'balanceTolerance' | 'seed' | 'restarts' | 'maxSwapTries'
>;

export interface TopicSplit {
	/** Indexed 0.. through the topics in the order given, so one topic's tables are neighbours. */
	tables: AssignedTable[];
	/** People whose choice is not one of the topics, or who chose nothing. */
	unseatedIds: string[];
	/** Topics exactly one person chose: a table of one, for the host to decide about. */
	topicsWithOnePerson: string[];
}

export function splitByChosenTopic(
	participants: readonly Participant[],
	topicIds: readonly string[],
	options: SplitOptions = {},
): TopicSplit {
	if (new Set(topicIds).size !== topicIds.length) {
		throw new TableAssignmentError('Duplicate topic id', { topicIds: [...topicIds] });
	}
	const byTopic = new Map<string, Participant[]>(topicIds.map((id) => [id, []]));
	const unseatedIds: string[] = [];
	for (const participant of participants) {
		const chosen = byTopic.get(participant.preferences[0] ?? '');
		if (chosen) chosen.push({ ...participant, preferences: [participant.preferences[0]] });
		else unseatedIds.push(participant.id);
	}

	const tables: AssignedTable[] = [];
	const topicsWithOnePerson: string[] = [];
	for (const topicId of topicIds) {
		const people = byTopic.get(topicId) ?? [];
		if (people.length === 0) continue;
		if (people.length === 1) topicsWithOnePerson.push(topicId);
		const { tables: topicTables } = assignTables(people, [{ id: topicId }], options);
		for (const table of topicTables) tables.push({ ...table, index: tables.length });
	}

	return { tables, unseatedIds, topicsWithOnePerson };
}

/** The part of a seated table a latecomer's placement needs. */
export interface SeatableTable {
	index: number;
	topicId: string;
	memberCount: number;
}

/**
 * Where a latecomer of `topicId` sits: the emptiest table of their topic that
 * still has a free seat (the lowest index on a tie), or undefined when every
 * table of the topic is full and the host has to seat them.
 */
export function emptiestTableWithSeat(
	tables: readonly SeatableTable[],
	topicId: string,
	tableSize: number,
): number | undefined {
	let best: SeatableTable | undefined;
	for (const table of tables) {
		if (table.topicId !== topicId || table.memberCount >= tableSize) continue;
		if (
			!best ||
			table.memberCount < best.memberCount ||
			(table.memberCount === best.memberCount && table.index < best.index)
		) {
			best = table;
		}
	}

	return best?.index;
}
