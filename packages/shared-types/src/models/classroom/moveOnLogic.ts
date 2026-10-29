import type { ClassTable } from './classroomModel';

/**
 * "Move on" (Trello 1c8jfvA6, GdrAEIF9): students can move their table on without
 * the teacher when a tablemate left or a phone broke. The table moves on when
 * this many different tablemates pressed; a table smaller than
 * `MOVE_ON_SMALL_TABLE` needs every one of them. Pure: the server enforces it,
 * the phones draw the count from the same functions.
 */
export const MOVE_ON_PRESSES = 2;
export const MOVE_ON_SMALL_TABLE = 3;

/** How many presses move a table of `memberCount` students on (never more than the table has). */
export function moveOnNeeded(memberCount: number): number {
	if (memberCount < MOVE_ON_SMALL_TABLE) return Math.max(memberCount, 1);

	return MOVE_ON_PRESSES;
}

/** The seated tablemates who pressed (a press by someone who left the table does not count). */
export function moveOnPressers(table: Pick<ClassTable, 'memberUids' | 'moveOnUids'>): string[] {
	const seated = new Set(table.memberUids);

	return (table.moveOnUids ?? []).filter((uid) => seated.has(uid));
}

/** Enough tablemates pressed "move on". */
export function moveOnReached(table: Pick<ClassTable, 'memberUids' | 'moveOnUids'>): boolean {
	return moveOnPressers(table).length >= moveOnNeeded(table.memberUids.length);
}
