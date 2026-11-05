import type { TableAssignmentParticipant, TableAssignmentTopic } from '@freedi/shared-types';

/**
 * Direct mode ("choose a table"). The contract has no table documents in
 * this mode, so the screens derive the table list from the topics: tables
 * are numbered from 0 in topic order, each topic opening `maxTables` tables
 * (one when the host set no cap). The server owns the real capacity check
 * (tablesJoinTable fails with failed-precondition when a table is full).
 */
export const DEFAULT_TABLES_PER_TOPIC = 1;

export interface DirectTable {
	/** Zero-based index sent to tablesJoinTable. */
	index: number;
	/** One-based number people read on the day. */
	number: number;
	topicId: string;
	topicTitle: string;
	/** Seats taken; null when the occupancy cannot be read (participants only see themselves). */
	taken: number | null;
	/** Seats left; null when unknown. */
	free: number | null;
}

/** Seats taken per table, counted from the registrants (host side, where all of them are readable). */
export function seatCountsFromParticipants(
	participants: readonly TableAssignmentParticipant[],
): Map<number, number> {
	const counts = new Map<number, number>();

	for (const participant of participants) {
		const index = participant.chosenTableIndex;

		if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1);
	}

	return counts;
}

export function deriveDirectTables(
	topics: readonly TableAssignmentTopic[],
	seatCounts: ReadonlyMap<number, number> | null,
	tableSize: number,
): DirectTable[] {
	const tables: DirectTable[] = [];
	let index = 0;

	for (const topic of topics) {
		const count = topic.maxTables ?? DEFAULT_TABLES_PER_TOPIC;

		for (let i = 0; i < count; i += 1) {
			// A table without a seat document has nobody at it.
			const taken = seatCounts === null ? null : (seatCounts.get(index) ?? 0);

			tables.push({
				index,
				number: index + 1,
				topicId: topic.topicId,
				topicTitle: topic.title,
				taken,
				free: taken === null ? null : Math.max(0, tableSize - taken),
			});
			index += 1;
		}
	}

	return tables;
}

/** A table is full only when its occupancy is known and no seat is left. */
export function isTableFull(table: DirectTable): boolean {
	return table.free === 0;
}

/** Find a derived table by the index a participant joined. */
export function tableByIndex(
	tables: readonly DirectTable[],
	index: number | undefined,
): DirectTable | undefined {
	return index === undefined ? undefined : tables.find((table) => table.index === index);
}
