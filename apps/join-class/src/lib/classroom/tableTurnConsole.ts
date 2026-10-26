import { choosing, tableDone, type ClassTable } from '@freedi/shared-types';
import { hasAnswered, passedAnswer } from './tableTalkState';

/**
 * Pure rules of the teacher's table card and sheet at Table talk (UX 16.L rev
 * 3): the one quick button, the card's second row (who the table waits for and
 * for how long), and the two marks on a member chip (asking, answering). No
 * Firebase, no DOM. `now` is the server clock.
 */

/** Which family of steps the board is showing. */
export type TableMode = 'tableTalk' | 'proposals' | 'plenum';

export type QuickKind = 'talk' | 'write' | 'rate' | 'turn' | 'finish';

export interface QuickAction {
	kind: QuickKind;
	/** The turn number "start turn n" opens (kind `turn` only). */
	n?: number;
}

/** i18n key of each verb: one form for students' buttons and the teacher's. */
export const QUICK_KEYS: Record<QuickKind, string> = {
	talk: 'console.quick_talk',
	write: 'console.quick_write',
	rate: 'console.quick_rate',
	turn: 'console.quick_turn',
	finish: 'console.finish_minute',
};

/** A minute is running (somebody holds the floor). */
export function minuteRunning(table: ClassTable, now: number): boolean {
	return !!table.speakerUid && table.speakerEndsAt !== undefined && table.speakerEndsAt > now;
}

/**
 * The ONE quick button of a table card. Table talk: "end the minute" while one
 * runs, nothing else (students start the next turn themselves). Proposals walk
 * talk -> write -> rate; the plenum only rates.
 */
export function quickActionFor(
	table: ClassTable,
	mode: TableMode,
	now: number,
): QuickAction | null {
	if (mode === 'plenum') return table.step === 'rate' ? null : { kind: 'rate' };
	if (mode === 'proposals') {
		if (table.step === 'pick') return { kind: 'talk' };
		if (table.step === 'talk') return { kind: 'write' };
		if (table.step === 'write') return { kind: 'rate' };

		return null;
	}

	return minuteRunning(table, now) ? { kind: 'finish' } : null;
}

export interface StatusLine {
	key: string;
	params?: Record<string, string | number>;
	/** uids to name in `params.names`, in order. */
	nameUids?: string[];
	/** Time since the table last changed (a stuck table shows how long). */
	elapsedMs?: number;
}

/** From this long on a waiting table is drawn as stuck (a clock glyph, not colour alone). */
export const STUCK_AFTER_MS = 120_000;

/** Members who asked, and members who passed on asking (leavers are not counted). */
export function askedPassedCounts(table: ClassTable): { a: number; p: number } {
	const asked = new Set(table.askedUids ?? []);
	const passed = new Set(table.passedAskingUids ?? []);
	const members = new Set(table.memberUids);

	return {
		a: [...asked].filter((uid) => members.has(uid)).length,
		p: [...passed].filter((uid) => members.has(uid) && !asked.has(uid)).length,
	};
}

/** Milliseconds since the table last changed: its doc, or the end of the last minute. */
export function elapsedSinceChange(table: ClassTable, now: number): number {
	return Math.max(0, now - Math.max(table.updatedAt, table.speakerEndsAt ?? 0));
}

/** Device members who have not answered or passed this question yet, in seating order. */
export function notAnsweredUids(table: ClassTable, now: number): string[] {
	return table.memberUids.filter((uid) => !hasAnswered(table, uid, now));
}

/**
 * The card's second row at Table talk when no minute runs: waiting for someone
 * to start, who has not answered, or "asked n, passed p". null while a minute
 * runs (the timer row says it) and outside Table talk.
 */
export function statusLine(
	table: ClassTable,
	mode: TableMode,
	now: number,
	noneLeft = false,
): StatusLine | null {
	if (mode !== 'tableTalk') return null;
	if (tableDone(table, now, noneLeft)) {
		const { a, p } = askedPassedCounts(table);

		return { key: 'console.asked_passed', params: { a, p } };
	}
	if (minuteRunning(table, now)) return null;
	const elapsedMs = elapsedSinceChange(table, now);
	if (choosing(table, now, noneLeft) || table.step === 'write' || table.step === 'rate') {
		return { key: 'console.waiting_start', elapsedMs };
	}

	return { key: 'console.not_answered', nameUids: notAnsweredUids(table, now), elapsedMs };
}

/** The asking mark on a member chip: asked (check), asking now (question mark), passed asking (dash). */
export type AskMark = '✓' | '?' | '–' | '';
/** The answering mark: answered (check), answering now (dot), passed this question (dash). */
export type AnswerMark = '✓' | '●' | '–' | '';

/** True while a question is on the table and not everyone has answered (the turn is running). */
function turnRunning(table: ClassTable, now: number): boolean {
	return (
		table.step === 'talk' && !!table.questionId && !choosing(table, now) && !tableDone(table, now)
	);
}

export function askMark(table: ClassTable, uid: string, now: number): AskMark {
	if (table.askerUid === uid && turnRunning(table, now)) return '?';
	if ((table.askedUids ?? []).includes(uid) || table.askerUid === uid) return '✓';

	return (table.passedAskingUids ?? []).includes(uid) ? '–' : '';
}

export function answerMark(table: ClassTable, uid: string, now: number): AnswerMark {
	if (table.step !== 'talk' || !table.questionId || choosing(table, now)) return '';
	if (table.speakerUid === uid && minuteRunning(table, now)) return '●';
	if (passedAnswer(table, uid)) return '–';

	return hasAnswered(table, uid, now) ? '✓' : '';
}

/** Every device member asked or passed and the last talk is over: the card's "now" says so. */
export function tableIsDone(
	table: ClassTable,
	mode: TableMode,
	now: number,
	noneLeft = false,
): boolean {
	return mode === 'tableTalk' && tableDone(table, now, noneLeft);
}
