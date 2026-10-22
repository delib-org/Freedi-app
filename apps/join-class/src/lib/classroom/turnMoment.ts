import {
	notAskedUids,
	type ClassTable,
	type Statement,
	type TableStep,
} from '@freedi/shared-types';
import { allSpoke, type FlowKind, type Mate } from './c3Logic';

/**
 * Pure rules of the table turn (UX 16): who asked, who may ask next, what the
 * one instruction of each moment says, and "n of m sent". No Firebase, no DOM.
 * "Table done" is derived: everyone with a device has asked, nothing is stored.
 */

export type AskerState = 'done' | 'now' | 'wait';

export interface AskerChip {
	uid: string;
	name: string;
	state: AskerState;
}

/**
 * One chip per device member in seating order. The current asker is "now" until
 * the table reaches rate; from there their turn is over and they count as done
 * (UX 16.C F). Everyone in `askedUids` is done.
 */
export function askerStates(table: ClassTable, mates: readonly Mate[]): AskerChip[] {
	const asked = new Set(table.askedUids ?? []);

	return mates.map((mate) => {
		const isAsker = mate.uid === table.askerUid;
		const state: AskerState = isAsker
			? table.step === 'rate'
				? 'done'
				: 'now'
			: asked.has(mate.uid)
				? 'done'
				: 'wait';

		return { uid: mate.uid, name: mate.name, state };
	});
}

export interface RateMoment {
	instructionKey: string;
	/** The hand-off card this phone shows: any not-yet student, or the last one left. */
	card: 'open' | 'one' | null;
	/** Who may ask next, in seating order (never the current asker). */
	nextUids: string[];
	/** Every device member has asked: the table has no next turn. */
	allAsked: boolean;
}

/** The rate screen of Table talk, as this student sees it. */
export function rateMoment(table: ClassTable, uid: string): RateMoment {
	const nextUids = notAskedUids(table);
	const allAsked = nextUids.length === 0;
	const card = nextUids.includes(uid) ? (nextUids.length === 1 ? 'one' : 'open') : null;
	const instructionKey = allAsked
		? 'turn.wait_others'
		: card === 'one'
			? 'turn.instr_rate_next'
			: card === 'open'
				? 'turn.instr_rate_open'
				: 'turn.instr_rate';

	return { instructionKey, card, nextUids, allAsked };
}

export interface Instruction {
	key: string;
	params?: Record<string, string>;
}

export interface InstructionInput {
	kind: FlowKind;
	table: ClassTable;
	uid: string;
	mates: readonly Mate[];
	/** The current minute is over (server clock). */
	timeUp: boolean;
}

function nameOf(mates: readonly Mate[], uid: string | null | undefined, fallback: string): string {
	return mates.find((mate) => mate.uid === uid)?.name ?? fallback;
}

function talkInstruction(input: InstructionInput): Instruction {
	const { table, uid, mates, timeUp } = input;
	if (table.speakerUid && timeUp && allSpoke(table, mates)) return { key: 'turn.all_spoke' };
	if (table.speakerUid && timeUp) return { key: 'turn.time_up' };
	if (!table.speakerUid) {
		return { key: table.askerUid === uid ? 'turn.instr_read' : 'turn.instr_listen' };
	}

	return { key: 'turn.instr_talk' };
}

/**
 * The one instruction of the official step (UX 16.G). `someone` is the
 * fallback name for a tablemate whose name is not loaded yet.
 */
export function instructionFor(
	step: TableStep,
	input: InstructionInput,
	someone: string,
): Instruction {
	const { kind, table, uid, mates } = input;
	if (kind === 'proposals') {
		if (step === 'talk') return { key: 'turn.instr_talk' };

		return { key: step === 'write' ? 'turn.instr_write_proposals' : 'turn.instr_rate_proposals' };
	}
	const isAsker = table.askerUid === uid;
	const asker = nameOf(mates, table.askerUid, someone);
	switch (step) {
		case 'pick':
			return isAsker
				? { key: 'turn.instr_pick' }
				: { key: 'turn.instr_pick_other', params: { name: asker } };
		case 'talk':
			return talkInstruction(input);
		case 'write':
			return table.writingMode === 'table' && !isAsker
				? { key: 'turn.instr_help', params: { name: asker } }
				: { key: 'turn.instr_write' };
		default:
			return { key: rateMoment(table, uid).instructionKey };
	}
}

export interface SentCount {
	n: number;
	m: number;
}

/**
 * "n of m sent": tablemates who wrote (or co-wrote, in one-answer-per-table
 * mode) an answer to this turn's question. A question is asked once per table,
 * so its answers from this table are exactly this turn's.
 */
export function sentCount(table: ClassTable, options: readonly Statement[]): SentCount {
	const members = new Set(table.memberUids);
	const senders = new Set<string>();
	for (const option of options) {
		if (!table.questionId || option.parentId !== table.questionId) continue;
		if (option.classTable?.tableId !== table.tableId) continue;
		if (members.has(option.creatorId)) senders.add(option.creatorId);
		for (const coAuthor of option.classTable.coAuthors) {
			if (members.has(coAuthor)) senders.add(coAuthor);
		}
	}

	return { n: senders.size, m: table.memberUids.length };
}

/** This student's own answer to the table's question (they wrote it or co-wrote it). */
export function myAnswer(
	table: ClassTable,
	options: readonly Statement[],
	uid: string,
): Statement | null {
	if (!table.questionId) return null;
	const mine = options.filter(
		(o) =>
			o.parentId === table.questionId &&
			o.classTable?.tableId === table.tableId &&
			(o.creatorId === uid || o.classTable.coAuthors.includes(uid)),
	);

	return mine.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
}

/** Who answered the table's call: the not-yet tablemates' names, in seating order. */
export function namesOf(
	uids: readonly string[],
	mates: readonly Mate[],
	someone: string,
): string[] {
	return uids.map((uid) => nameOf(mates, uid, someone));
}

/** Why a call was refused, when the engine says it (HttpsError `details.reason`). */
export function refusalReason(error: unknown): string | null {
	if (typeof error !== 'object' || error === null || !('details' in error)) return null;
	const details = (error as { details?: unknown }).details;
	if (typeof details !== 'object' || details === null || !('reason' in details)) return null;
	const reason = (details as { reason?: unknown }).reason;

	return typeof reason === 'string' ? reason : null;
}
