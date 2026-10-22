import { notAskedUids, type ClassTable } from '@freedi/shared-types';
import { claimMoment, talkIsOver } from './turnMoment';

/**
 * Pure rules of the teacher's table card and sheet at Table talk (UX 16.E,
 * 16.F): the one next-step button, the second line (who the table waits for),
 * and the marks on member chips. No Firebase, no DOM. `now` is the server clock.
 */

/** Which family of steps the board is showing. */
export type TableMode = 'tableTalk' | 'proposals' | 'plenum';

export type QuickKind = 'talk' | 'write' | 'rate' | 'turn';

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
};

/**
 * The ONE next-step button of a table card. Table talk: "לדבר" once the asker
 * chose a question; "להתחיל סבב n" (opens a volunteer moment) when everyone has
 * spoken; nothing else, nobody writes or rates there. Proposals walk talk ->
 * write -> rate; the plenum only rates.
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
	const { phase } = claimMoment(table, '', now);
	if (phase === 'a') return table.questionId ? { kind: 'talk' } : null;

	return phase === 'v2' ? { kind: 'turn', n: table.turn + 1 } : null;
}

export interface StatusLine {
	key: string;
	params?: Record<string, string | number>;
	/** uids to name in `params.names` / `params.name`, in order. */
	nameUids?: string[];
}

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

/**
 * The card's second line at Table talk: waiting for a volunteer, for the asker,
 * who has not asked, or "asked n, passed p". null while someone is speaking (the
 * timer rows say it) and outside Table talk.
 */
export function statusLine(table: ClassTable, mode: TableMode, now: number): StatusLine | null {
	if (mode !== 'tableTalk') return null;
	const { phase } = claimMoment(table, '', now);
	const waiting: StatusLine = { key: 'console.waiting_for', nameUids: [table.askerUid ?? ''] };
	switch (phase) {
		case 'v1':
			return { key: 'console.waiting_volunteer' };
		case 'a':
			return waiting;
		case 'talk':
			return table.speakerUid || !table.askerUid ? null : waiting;
		case 'v2': {
			const left = notAskedUids(table);

			return left.length === 1
				? { key: 'console.waiting_for', nameUids: left }
				: { key: 'console.not_asked', nameUids: left };
		}
		default: {
			const { a, p } = askedPassedCounts(table);

			return { key: 'console.asked_passed', params: { a, p } };
		}
	}
}

/** Mark on a member chip: asked (check), asking now (question mark), passed (dash) or none. */
export function memberMark(table: ClassTable, uid: string, now: number): '✓' | '?' | '–' | '' {
	if (table.askerUid === uid) return table.step !== 'pick' && talkIsOver(table, now) ? '✓' : '?';
	if ((table.askedUids ?? []).includes(uid)) return '✓';

	return (table.passedAskingUids ?? []).includes(uid) ? '–' : '';
}

/** Every device member asked or passed and the last talk is over: the card's "now" says so. */
export function tableIsDone(table: ClassTable, mode: TableMode, now: number): boolean {
	return mode === 'tableTalk' && claimMoment(table, '', now).phase === 'done';
}
