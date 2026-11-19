import { proposalsDone, proposalsTurnOf } from '@freedi/shared-types';
import type {
	ClassTable,
	ClassTableAction,
	LessonSettingsHolder,
	TableStep,
} from '@freedi/shared-types';
import type { OptimisticChange } from './optimisticOverlay';

/**
 * What the teacher's and the student's screens may show BEFORE the server answers
 * (the overlay in optimisticOverlay.ts holds it). Only actions whose result is
 * fixed for the caller are guessed here; an action whose winner the server decides
 * (claimSpeaker, claimPen, claimTurn) has no entry. A guess changes only what the
 * server's own code would change for that action, and a table the guess does not
 * know is left as it is. The server can still refuse: the caller rolls back.
 */

export type TableList = readonly ClassTable[];
export type TableChange = OptimisticChange<ClassTable[]>;

/** Who is pressing, and when (server clock). */
export interface Actor {
	/** What the screen holds now: a student's `toWrite` is guessed only when the table is really done talking. */
	table?: ClassTable;
	main?: LessonSettingsHolder | null;
	uid: string;
	isAdmin: boolean;
	now: number;
}

function without<K extends keyof ClassTable>(table: ClassTable, keys: K[]): ClassTable {
	const copy: ClassTable = { ...table };
	for (const key of keys) delete copy[key];

	return copy;
}

const withoutSpeaker = (table: ClassTable): ClassTable =>
	without(table, ['speakerUid', 'speakerEndsAt', 'speakerMs']);
const withoutPen = (table: ClassTable): ClassTable => without(table, ['writerUid', 'writtenUids']);

function withSpoken(table: ClassTable): string[] {
	return table.speakerUid && !table.spokenUids.includes(table.speakerUid)
		? [...table.spokenUids, table.speakerUid]
		: table.spokenUids;
}

function addOnce(list: readonly string[] | undefined, uid: string): string[] {
	const current = list ?? [];

	return current.includes(uid) ? [...current] : [...current, uid];
}

/** Change one table of the list (a table that is not in the list is simply not there to change). */
function onTable(
	tableId: string,
	patch: (table: ClassTable) => ClassTable,
	isShown: (table: ClassTable) => boolean,
): TableChange {
	return {
		apply: (tables) => tables.map((table) => (table.tableId === tableId ? patch(table) : table)),
		isConfirmedBy: (tables) => {
			const table = tables.find((candidate) => candidate.tableId === tableId);

			// Absent from this snapshot is not done: only a table that shows the change confirms it.
			return table !== undefined && isShown(table);
		},
	};
}

/**
 * The guess for one `classTableStep` action, or null when the outcome is not fixed
 * for the caller (or not worth guessing): the caller then waits for the server.
 */
export function predictTableAction(
	tableId: string,
	action: ClassTableAction,
	actor: Actor,
): TableChange | null {
	const { uid, isAdmin, now } = actor;
	switch (action.action) {
		case 'toWrite':
			// The server lets a student do this only once the table is at talk, every member spoke and no
			// round is left (proposalsDone, the same rule that shows the button); otherwise it refuses.
			if (
				!isAdmin &&
				!(actor.table && actor.table.step === 'talk' && proposalsDone(actor.table, actor.main, now))
			) {
				return null;
			}

			return onTable(
				tableId,
				(table) => {
					const writing: ClassTable = {
						...withoutSpeaker(table),
						step: 'write',
						spokenUids: withSpoken(table),
					};

					return table.step === 'write' ? writing : withoutPen(writing);
				},
				(table) => table.step === 'write',
			);
		case 'toRate':
			// Students never move the table to rate (the server refuses them): only a teacher's tap is guessed.
			return isAdmin
				? onTable(
						tableId,
						(table) => withoutPen({ ...withoutSpeaker(table), step: 'rate' }),
						(table) => table.step === 'rate',
					)
				: null;
		case 'toTalk':
			return isAdmin
				? onTable(
						tableId,
						(table) => ({
							...without(withoutSpeaker(withoutPen(table)), ['passedSpeakingUids']),
							step: 'talk',
							spokenUids: [],
						}),
						(table) => table.step === 'talk',
					)
				: null;
		case 'setWritingMode':
			return onTable(
				tableId,
				(table) => (table.writingLocked ? table : { ...table, writingMode: action.mode }),
				(table) => table.writingMode === action.mode || table.writingLocked === true,
			);
		case 'passWriting':
			// Only for oneself: the pen goes back and "I wrote" counts. The step is left to the server.
			return action.uid === undefined || action.uid === uid
				? onTable(
						tableId,
						(table) => {
							const freed = table.writerUid === uid ? without(table, ['writerUid']) : table;

							return { ...freed, writtenUids: addOnce(freed.writtenUids, uid) };
						},
						(table) => (table.writtenUids ?? []).includes(uid),
					)
				: null;
		case 'finishSpeaking':
			return onTable(
				tableId,
				(table) =>
					table.speakerUid === uid || isAdmin
						? { ...table, spokenUids: withSpoken(table), speakerEndsAt: now }
						: table,
				(table) =>
					!table.speakerUid ||
					(table.speakerUid !== uid && !isAdmin) ||
					table.spokenUids.includes(table.speakerUid),
			);
		case 'passSpeaking':
			// Only the plain case: nobody holds the floor and the caller passes for themselves.
			return action.uid === undefined || action.uid === uid
				? passSpeakingGuess(tableId, uid)
				: null;
		default:
			return null;
	}
}

function passSpeakingGuess(tableId: string, uid: string): TableChange {
	const applies = (table: ClassTable): boolean =>
		table.speakerUid === undefined && !table.spokenUids.includes(uid);

	return onTable(
		tableId,
		(table) =>
			applies(table)
				? {
						...table,
						spokenUids: addOnce(table.spokenUids, uid),
						passedSpeakingUids: addOnce(table.passedSpeakingUids, uid),
					}
				: table,
		(table) => table.spokenUids.includes(uid),
	);
}

/** The teacher moves one student to table `toTable` (1-based) or unseats them (null). */
export function predictMoveStudent(uid: string, toTable: number | null): TableChange {
	return {
		apply: (tables) =>
			tables.map((table) => {
				const there = table.memberUids.includes(uid);
				const target = toTable !== null && table.n === toTable;
				if (target && !there) return { ...table, memberUids: [...table.memberUids, uid] };
				if (!target && there) {
					return { ...table, memberUids: table.memberUids.filter((member) => member !== uid) };
				}

				return table;
			}),
		isConfirmedBy: (tables) =>
			tables.every(
				(table) => table.memberUids.includes(uid) === (toTable !== null && table.n === toTable),
			),
	};
}

/**
 * The teacher puts every table on `step` (classAllTablesTo). With `newTurn` a
 * table moves to the next turn only if it is still at the turn the console saw
 * (`fromTurns`), exactly as the server decides.
 */
export function predictAllTablesTo(
	step: TableStep,
	options: { newTurn?: boolean; fromTurns?: Record<string, number> } = {},
): TableChange {
	const { newTurn = false, fromTurns } = options;
	const skipped = (table: ClassTable): boolean => {
		const seen = fromTurns?.[table.tableId];

		return step === 'talk' && newTurn && seen !== undefined && seen !== proposalsTurnOf(table);
	};

	return {
		apply: (tables) =>
			tables.map((table) => {
				if (skipped(table)) return table;
				const moved = withoutSpeaker({ ...table, step });
				const penFresh = table.step !== step ? withoutPen(moved) : moved;
				if (step !== 'talk') return penFresh;

				return {
					...without(penFresh, ['passedSpeakingUids']),
					spokenUids: [],
					proposalsTurn: newTurn ? proposalsTurnOf(table) + 1 : 1,
				};
			}),
		isConfirmedBy: (tables) =>
			tables.every(
				(table) =>
					skipped(table) ||
					(table.step === step &&
						(step !== 'talk' ||
							!newTurn ||
							proposalsTurnOf(table) > (fromTurns?.[table.tableId] ?? 0))),
			),
	};
}
