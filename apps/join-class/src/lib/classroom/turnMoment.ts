import { everyoneSpoke, notAskedUids, type ClassTable, type TableStep } from '@freedi/shared-types';
import type { FlowKind, Mate } from './c3Logic';

/**
 * Pure rules of the table turn (UX 16 rev 2): who asked, passed or asks now,
 * which of the five moments a table is at, what the one instruction of each
 * moment says. No Firebase, no DOM. "Table done" is derived (shared-types
 * `tableDone`): everyone with a device has asked or passed, nothing is stored.
 */

export type AskerState = 'done' | 'now' | 'passed' | 'wait';

export interface AskerChip {
	uid: string;
	name: string;
	state: AskerState;
}

/** A table left at write or rate before v2 is drawn as the end of talk. */
function isLegacyTail(step: TableStep): boolean {
	return step === 'write' || step === 'rate';
}

/** The current talk is over: everyone spoke or passed (or the table is a leftover from before v2). */
export function talkIsOver(table: ClassTable, now: number): boolean {
	return isLegacyTail(table.step) || everyoneSpoke(table, now);
}

/** The five moments of Table talk (UX 16.C): V1, A, B/C (talk), V2, done. */
export type TurnPhase = 'v1' | 'a' | 'talk' | 'v2' | 'done';

export interface ClaimMoment {
	phase: TurnPhase;
	/** This phone shows "אני אשאל": a volunteer moment and this student may still ask. */
	canClaim: boolean;
	/** This phone shows "ויתרתי על התור". */
	canPassAsk: boolean;
	/** Exactly one student may still ask. */
	lastLeft: boolean;
	/** The one student left, when it is not this phone's own student. */
	waitingFor: string | null;
}

/** Which moment the table is at and what this student may do at it. */
export function claimMoment(table: ClassTable, uid: string, now: number): ClaimMoment {
	const notYet = notAskedUids(table);
	const over = talkIsOver(table, now);
	let phase: TurnPhase;
	if (notYet.length === 0 && (table.askerUid === null || over)) phase = 'done';
	else if (table.step === 'pick') phase = table.askerUid === null ? 'v1' : 'a';
	else phase = over ? 'v2' : 'talk';
	const volunteer = phase === 'v1' || phase === 'v2';
	const mayAsk = notYet.includes(uid);
	const lastLeft = notYet.length === 1;

	return {
		phase,
		canClaim: volunteer && mayAsk,
		canPassAsk: (volunteer && mayAsk) || (phase === 'a' && table.askerUid === uid),
		lastLeft,
		waitingFor: lastLeft && !mayAsk ? notYet[0] : null,
	};
}

/**
 * One chip per device member in seating order: asked (done), passed on asking,
 * asking now, or not yet. The current asker is "now" until everyone spoke (V2),
 * then done.
 */
export function askerStates(table: ClassTable, mates: readonly Mate[], now: number): AskerChip[] {
	const passed = new Set(table.passedAskingUids ?? []);
	const asked = new Set(table.askedUids ?? []);
	const over = talkIsOver(table, now);

	return mates.map((mate) => {
		const isAsker = mate.uid === table.askerUid;
		let state: AskerState = 'wait';
		if (isAsker) state = table.step !== 'pick' && over ? 'done' : 'now';
		else if (passed.has(mate.uid)) state = 'passed';
		else if (asked.has(mate.uid)) state = 'done';

		return { uid: mate.uid, name: mate.name, state };
	});
}

/** "Turn n of max": one turn per device member who has not passed on asking. */
export function maxTurns(table: ClassTable): number {
	const passed = new Set(table.passedAskingUids ?? []);
	const kept = table.memberUids.filter((uid) => !passed.has(uid)).length;

	return Math.max(kept, table.turn);
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
	/** Server clock, epoch ms. */
	now: number;
	/** Every teacher question was asked at this table: the asker writes their own. */
	allUsed?: boolean;
}

function nameOf(mates: readonly Mate[], uid: string | null | undefined, fallback: string): string {
	return mates.find((mate) => mate.uid === uid)?.name ?? fallback;
}

function talkInstruction(input: InstructionInput): Instruction {
	const { table, uid, timeUp } = input;
	if (table.speakerUid && timeUp) return { key: 'turn.time_up' };
	if (!table.speakerUid) {
		return { key: table.askerUid === uid ? 'turn.instr_read' : 'turn.instr_listen' };
	}

	return { key: 'turn.instr_talk' };
}

/** V1 and V2: who volunteers; the last student left is named. */
function volunteerInstruction(
	moment: ClaimMoment,
	input: InstructionInput,
	someone: string,
): Instruction {
	if (moment.canClaim && moment.lastLeft) return { key: 'turn.last_to_ask' };
	if (moment.waitingFor) {
		return {
			key: 'turn.waiting_for',
			params: { name: nameOf(input.mates, moment.waitingFor, someone) },
		};
	}
	if (moment.phase === 'v2') return { key: 'turn.who_asks_now' };

	return { key: input.table.turn > 1 ? 'turn.who_asks_again' : 'turn.who_first_asks' };
}

function pickInstruction(input: InstructionInput, someone: string): Instruction {
	const { table, uid, mates, allUsed } = input;
	const isAsker = table.askerUid === uid;
	const asker = nameOf(mates, table.askerUid, someone);
	if (allUsed) {
		return isAsker
			? { key: 'turn.instr_write_own' }
			: { key: 'turn.instr_write_own_other', params: { name: asker } };
	}

	return isAsker
		? { key: 'turn.instr_pick' }
		: { key: 'turn.instr_pick_other', params: { name: asker } };
}

/**
 * The one instruction of the official step (UX 16.C). `someone` is the
 * fallback name for a tablemate whose name is not loaded yet.
 */
export function instructionFor(
	step: TableStep,
	input: InstructionInput,
	someone: string,
): Instruction {
	if (input.kind === 'proposals') {
		if (step === 'talk') return { key: 'turn.instr_talk' };

		return { key: step === 'write' ? 'turn.instr_write_proposals' : 'turn.instr_rate_proposals' };
	}
	const moment = claimMoment(input.table, input.uid, input.now);
	switch (moment.phase) {
		case 'done':
			return { key: 'turn.wait_others' };
		case 'v1':
		case 'v2':
			return volunteerInstruction(moment, input, someone);
		case 'a':
			return pickInstruction(input, someone);
		default:
			return talkInstruction(input);
	}
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
