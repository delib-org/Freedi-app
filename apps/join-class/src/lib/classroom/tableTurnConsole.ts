import { notAskedUids, type ClassTable, type Statement } from '@freedi/shared-types';
import { sentCount } from './turnMoment';

/**
 * Pure rules of the teacher's table card and sheet at Table talk (UX 16.E,
 * 16.F): the one next-step button, the second line (who the table waits for),
 * and the marks on member chips. No Firebase, no DOM.
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
 * The ONE next-step button of a table card. Table talk follows the turn:
 * pick (once a question is chosen) -> talk -> write -> rate -> start the next
 * turn, which gives it to the first tablemate who has not asked; nothing once
 * everyone has. Proposals walk talk -> write -> rate; the plenum only rates.
 */
export function quickActionFor(table: ClassTable, mode: TableMode): QuickAction | null {
	if (mode === 'plenum') return table.step === 'rate' ? null : { kind: 'rate' };
	if (mode === 'proposals') {
		if (table.step === 'pick') return { kind: 'talk' };
		if (table.step === 'talk') return { kind: 'write' };
		if (table.step === 'write') return { kind: 'rate' };

		return null;
	}
	switch (table.step) {
		case 'pick':
			return table.questionId ? { kind: 'talk' } : null;
		case 'talk':
			return { kind: 'write' };
		case 'write':
			return { kind: 'rate' };
		default:
			return notAskedUids(table).length > 0 ? { kind: 'turn', n: table.turn + 1 } : null;
	}
}

export interface StatusLine {
	key: string;
	params?: Record<string, string | number>;
	/** uids to name in `params.names` / `params.name`, in order. */
	nameUids?: string[];
}

/**
 * The card's second line at Table talk: who the table waits for, "n of m
 * sent", who has not asked, or who is next. null while someone is speaking
 * (the timer rows say it) and outside Table talk.
 */
export function statusLine(
	table: ClassTable,
	mode: TableMode,
	options: readonly Statement[],
): StatusLine | null {
	if (mode !== 'tableTalk') return null;
	const waiting: StatusLine = { key: 'console.waiting_for', nameUids: [table.askerUid ?? ''] };
	if (table.step === 'pick') return table.askerUid ? waiting : null;
	if (table.step === 'talk') return table.speakerUid || !table.askerUid ? null : waiting;
	if (table.step === 'write') {
		const { n, m } = sentCount(table, options);

		return { key: 'turn.sent_count', params: { n, m } };
	}
	const next = notAskedUids(table);
	if (next.length === 0) {
		const { n, m } = sentCount(table, options);

		return { key: 'turn.sent_count', params: { n, m }, nameUids: [] };
	}

	return next.length === 1
		? { key: 'console.next_asker', nameUids: next }
		: { key: 'console.not_asked', nameUids: next };
}

/** Mark on a member chip: asked (check), asking now (question mark) or none. */
export function memberMark(table: ClassTable, uid: string): '✓' | '?' | '' {
	if ((table.askedUids ?? []).includes(uid)) return '✓';
	if (table.askerUid !== uid) return '';

	return table.step === 'rate' ? '✓' : '?';
}

/** The table's "now" line gains "everyone asked" at the last rate. */
export function everyoneAsked(table: ClassTable, mode: TableMode): boolean {
	return mode === 'tableTalk' && table.step === 'rate' && notAskedUids(table).length === 0;
}
