import { CAMP_A_BELOW, CAMP_B_ABOVE, SIDE_MAX, SIDE_MIN } from '@freedi/shared-types';
import type { Camp, ClassTable, Statement } from '@freedi/shared-types';
import type { RosterSubscription } from '@/lib/classroom/rosterPrivacy';

/**
 * Pure helpers of the first student screens (waiting, opening, side, my table).
 * No Firestore, no DOM, so every rule can be unit-tested.
 */

/** Slider start value: the centre, a valid answer. */
export const SIDE_CENTER = (SIDE_MIN + SIDE_MAX) / 2;

/** i18n keys of the three words under the slider thumb. */
export type SideWordKey = 'side.near_a' | 'side.middle' | 'side.near_b';

/** Side A: 0..39, centre: 40..60, side B: 61..100 (the thresholds of `campOf`). */
export function sideWordKey(value: number): SideWordKey {
	if (value < CAMP_A_BELOW) return 'side.near_a';
	if (value > CAMP_B_ABOVE) return 'side.near_b';

	return 'side.middle';
}

const CAMP_MARKS: Record<Camp, string> = { a: '●', center: '◆', b: '■' };
const NO_CAMP_MARK = '○';

/** Shape of a side (colour is never the only cue): A circle, centre diamond, B square. */
export function campMark(camp: Camp | undefined): string {
	return camp ? CAMP_MARKS[camp] : NO_CAMP_MARK;
}

/** The challenge question the lesson is about, or null. */
export function challengeOf(subQuestions: readonly Statement[]): Statement | null {
	const found = subQuestions.find(
		(s) => (s.statementSettings as { classRole?: unknown } | undefined)?.classRole === 'challenge',
	);

	return found ?? null;
}

/** Table number from a table doc id `{mainId}--{n}`; null if it does not parse. */
export function tableNumberOf(tableId: string | undefined): number | null {
	if (!tableId) return null;
	const n = Number(tableId.slice(tableId.lastIndexOf('--') + 2));

	return Number.isInteger(n) && n > 0 ? n : null;
}

/** One tablemate chip: who, which side, and whether it is the student. */
export interface TableChip {
	key: string;
	name: string;
	camp?: Camp;
	mark: string;
	isMe: boolean;
	label: string;
}

export interface TableChipOptions {
	myUid: string | undefined;
	/** The student's own camp (from their private side doc); tablemates' sides are private. */
	myCamp?: Camp;
	/** Spoken label of a chip, e.g. "Dana, close to Noa". */
	labelOf: (name: string, camp: Camp | undefined) => string;
	/** Name shown when a tablemate has no name yet. */
	fallbackName: string;
}

/**
 * Chips for the students at a table (device members by uid, looked up in the
 * roster for the name) followed by the no-device members. Only the student's
 * own chip carries a side mark: everyone's side is private (Trello btMVQMM5).
 * Me first, so the student finds themselves.
 */
export function tableChips(
	table: ClassTable | null,
	roster: readonly RosterSubscription[],
	options: TableChipOptions,
): TableChip[] {
	if (!table) return [];
	const byUid = new Map(roster.map((sub) => [sub.userId, sub]));
	const members: TableChip[] = table.memberUids.map((uid) => {
		const sub = byUid.get(uid);
		const name = sub?.user?.displayName?.trim() || options.fallbackName;
		const camp = uid === options.myUid ? options.myCamp : undefined;

		return {
			key: uid,
			name,
			camp,
			mark: campMark(camp),
			isMe: uid === options.myUid,
			label: options.labelOf(name, camp),
		};
	});
	members.sort((a, b) => Number(b.isMe) - Number(a.isMe));
	const noDevice: TableChip[] = table.noDeviceMembers.map((member) => ({
		key: member.id,
		name: member.name,
		mark: campMark(undefined),
		isMe: false,
		label: member.name,
	}));

	return [...members, ...noDevice];
}
