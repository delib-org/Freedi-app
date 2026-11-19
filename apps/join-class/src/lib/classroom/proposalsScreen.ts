import { proposalsTurnOf, spokeThisTurn, wroteAlready } from '@freedi/shared-types';
import type { ClassTable, LessonSettingsHolder } from '@freedi/shared-types';
import { proposalsTalkState, type ProposalsTalkKind } from './proposalsTurn';

/**
 * Where a phone is at Proposals, as one pure answer (IA join-class-proposals-flow
 * §4): the table goes Talk, Write, Rate together, and each phone shows only what a
 * tap can do right now. The states are T1-T6 (talk), W1-W4 (write) and R1-R2
 * (rate). No Firebase, no DOM; `now` is the server clock in ms.
 */

/** Write: W1 pen free and I have not written, W2 I hold the pen, W3 a tablemate holds it, W4 I wrote or passed. */
export type WriteKind = 'free' | 'mine' | 'other' | 'wait';

export interface TalkScreenState {
	part: 'talk';
	kind: ProposalsTalkKind;
	/** The round the screen names (the next one once this round is over and another is left). */
	turn: number;
	max: number;
	/** Everyone spoke in this round and the next opens with the next tap (T5). */
	roundOver: boolean;
	/** The tablemate who speaks now (T2, T3). */
	speakerUid?: string;
	/** Tablemates who have not spoken yet in this round, in seating order. */
	notSpoken: string[];
}

export interface WriteScreenState {
	part: 'write';
	kind: WriteKind;
	/** The pen holder (W2, W3; W4 while a tablemate still holds it). */
	writerUid?: string;
	/** Tablemates who have not sent or passed yet, never me, in seating order. */
	notWritten: string[];
	/** The pen is free and a tap on "I want to write" would work. */
	canClaim: boolean;
	/** I have sent a proposal or passed. */
	wrote: boolean;
}

export interface RateScreenState {
	part: 'rate';
}

export type ProposalsScreen = TalkScreenState | WriteScreenState | RateScreenState;

export interface ProposalsScreenInput {
	table: ClassTable;
	uid: string;
	main: LessonSettingsHolder | null | undefined;
	now: number;
	/** The lesson lets an author send more than one proposal. */
	unlimited: boolean;
}

function writeScreen(table: ClassTable, uid: string, unlimited: boolean): WriteScreenState {
	const wrote = wroteAlready(table, uid);
	const { writerUid } = table;
	const notWritten = table.memberUids.filter((m) => m !== uid && !wroteAlready(table, m));
	const penFree = !writerUid;
	const canClaim = penFree && (!wrote || unlimited);
	let kind: WriteKind;
	if (writerUid === uid) kind = 'mine';
	else if (writerUid && !wrote) kind = 'other';
	else if (penFree && !wrote) kind = 'free';
	else kind = 'wait';

	return { part: 'write', kind, writerUid, notWritten, canClaim, wrote };
}

function talkScreen(input: ProposalsScreenInput): TalkScreenState {
	const { table, uid, main, now } = input;
	const state = proposalsTalkState(table, uid, main, now);
	const notSpoken = table.memberUids.filter((m) => !spokeThisTurn(table, m, now));
	const roundOver = state.kind === 'may' && state.turn > proposalsTurnOf(table);

	return {
		part: 'talk',
		kind: state.kind,
		turn: state.turn,
		max: state.max,
		roundOver,
		speakerUid: state.kind === 'mine' || state.kind === 'speaking' ? table.speakerUid : undefined,
		// A new round starts with nobody spoken, whatever the old round's list says.
		notSpoken: roundOver ? [...table.memberUids] : notSpoken,
	};
}

/** The screen of this phone: it follows the table's step, never the phone's own pick. */
export function proposalsScreenOf(input: ProposalsScreenInput): ProposalsScreen {
	const { table, uid, unlimited } = input;
	if (table.step === 'write') return writeScreen(table, uid, unlimited);
	if (table.step === 'rate') return { part: 'rate' };

	return talkScreen(input);
}

/** The "what is next" line: an i18n key and the tablemates it names (the view turns them into names). */
export interface NextLine {
	key: string;
	uids: string[];
}

function without(uids: readonly string[], ...out: (string | undefined)[]): string[] {
	return uids.filter((id) => !out.includes(id));
}

function talkNext(screen: TalkScreenState, uid: string): NextLine | null {
	const { kind, notSpoken, speakerUid } = screen;
	if (kind === 'may') {
		const others = without(notSpoken, uid);

		return others.length > 0 ? { key: 'proposals.next.not_spoken', uids: others } : null;
	}
	if (kind === 'speaking' && speakerUid) {
		return without(notSpoken, speakerUid).length > 0
			? { key: 'proposals.next.after', uids: [speakerUid] }
			: null;
	}
	if (kind === 'spoke' && notSpoken.length > 0) {
		return { key: 'proposals.next.waiting_for', uids: notSpoken };
	}

	return null;
}

function writeNext(screen: WriteScreenState): NextLine | null {
	const { kind, notWritten, writerUid } = screen;
	if (kind === 'free' && notWritten.length > 0) {
		return { key: 'proposals.next.not_written', uids: notWritten };
	}
	if (kind === 'other' && writerUid) return { key: 'proposals.next.after', uids: [writerUid] };
	if (kind === 'wait' && notWritten.length > 0) {
		return { key: 'proposals.next.waiting_for', uids: notWritten };
	}

	return null;
}

/** The one "who is next / what we wait for" line under the state, or null when there is nothing to say. */
export function nextLineOf(screen: ProposalsScreen, uid: string): NextLine | null {
	if (screen.part === 'talk') return talkNext(screen, uid);
	if (screen.part === 'write') return writeNext(screen);

	return null;
}

/** Which controls the screen offers: a button exists only when its tap works right now. */
export interface ProposalsControls {
	/** "I want to speak" and its quiet "pass" (T1, T5). */
	speak: boolean;
	/** "I'm done" (T2). */
	finish: boolean;
	/** "Move on" for a mate who left (T4 only). */
	moveOn: boolean;
	/** "Go to writing" moves the whole table (T6). */
	toWrite: boolean;
	/** "I want to write" and its quiet "pass" (W1; W4 with unlimited proposals). */
	claimPen: boolean;
	/** "Send my proposal" and its quiet "pass" (W2). */
	sendOrPass: boolean;
}

export function controlsOf(screen: ProposalsScreen): ProposalsControls {
	const none: ProposalsControls = {
		speak: false,
		finish: false,
		moveOn: false,
		toWrite: false,
		claimPen: false,
		sendOrPass: false,
	};
	if (screen.part === 'talk') {
		return {
			...none,
			speak: screen.kind === 'may',
			finish: screen.kind === 'mine',
			moveOn: screen.kind === 'spoke',
			toWrite: screen.kind === 'done',
		};
	}
	if (screen.part === 'write') {
		return {
			...none,
			claimPen: screen.canClaim,
			sendOrPass: screen.kind === 'mine',
		};
	}

	return none;
}
