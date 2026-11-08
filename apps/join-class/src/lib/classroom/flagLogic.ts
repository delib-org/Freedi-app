import type { ClassLanguageFlag, ClassTable } from '@freedi/shared-types';
import type { RosterStudent } from './consoleHelpers';

/**
 * Pure side of the teacher's language flags (IA 24.4): which attempts are
 * still unseen, and one row per student for the expanded list. No Firestore,
 * no DOM. The attempted text is only ever carried to the teacher's own screen.
 */

export interface FlagRow {
	uid: string;
	/** The student's real name (the teacher sees it), else a short id. */
	name: string;
	/** The student's table number, or null when unplaced. */
	tableN: number | null;
	/** How many attempts so far: the newest flag's attempt number, never below the flags kept. */
	count: number;
	/** The most recent attempt. */
	last: ClassLanguageFlag;
	/** The unseen attempts, newest first (what "show the text" reveals). */
	unseen: ClassLanguageFlag[];
}

const SHORT_UID_LENGTH = 4;

/** Attempts the teacher has not marked seen. */
export function unseenFlags(flags: readonly ClassLanguageFlag[]): ClassLanguageFlag[] {
	return flags.filter((f) => f.seenAt === undefined);
}

export function unseenFlagCount(flags: readonly ClassLanguageFlag[]): number {
	return unseenFlags(flags).length;
}

/** One row per student with an unseen attempt, the most recently flagged first. */
export function flagRows(
	flags: readonly ClassLanguageFlag[],
	students: readonly RosterStudent[],
	tables: readonly ClassTable[],
): FlagRow[] {
	const byUid = new Map<string, ClassLanguageFlag[]>();
	for (const flag of flags) byUid.set(flag.uid, [...(byUid.get(flag.uid) ?? []), flag]);
	const rows: FlagRow[] = [];
	for (const [uid, list] of byUid) {
		const unseen = unseenFlags(list).sort((a, b) => b.createdAt - a.createdAt);
		if (unseen.length === 0) continue;
		const student = students.find((s) => s.uid === uid);
		const table = student?.tableId
			? tables.find((tb) => tb.tableId === student.tableId)
			: undefined;
		const newest = [...list].sort((a, b) => b.createdAt - a.createdAt)[0];
		rows.push({
			uid,
			name: student?.name ?? uid.slice(0, SHORT_UID_LENGTH),
			tableN: table?.n ?? null,
			count: Math.max(newest.attempt, list.length),
			last: unseen[0],
			unseen,
		});
	}

	return rows.sort((a, b) => b.last.createdAt - a.last.createdAt || a.uid.localeCompare(b.uid));
}

/** The text key of the "n attempts" line: singular or plural. */
export function flagsLineKey(n: number): string {
	return n === 1 ? 'console.flags_one' : 'console.flags_n';
}

/** The text key of one student's attempts count. */
export function flagCountKey(n: number): string {
	return n === 1 ? 'console.flag_count_one' : 'console.flag_count';
}
