import {
	askerMayAnswer,
	choosing,
	speakerTimeOver,
	tableDone,
	type ClassTable,
} from '@freedi/shared-types';

/**
 * The eight screens of Table talk (IA 16.4 rev 3), one per state, decided from
 * the table doc alone. Pure: no Firebase, no DOM. `now` is the server clock.
 * The first match wins, top to bottom.
 *
 *   D   the table is done                       P1  pick: I may still start
 *   P2  pick: I asked or passed                 S   my minute is running
 *   L   someone else's minute is running        W   I asked: let others answer first
 *   A   the floor is open and I may answer      H   I answered or passed this question
 */
export type TableTalkState = 'D' | 'P1' | 'P2' | 'S' | 'L' | 'W' | 'A' | 'H';

/** A table left at write or rate before v3 is drawn as choosing (the next pick). */
function isLegacyTail(table: ClassTable): boolean {
	return table.step === 'write' || table.step === 'rate';
}

/** Has this uid asked or passed asking (this lesson, this table)? */
export function doneAsking(table: ClassTable, uid: string): boolean {
	return (table.askedUids ?? []).includes(uid) || (table.passedAskingUids ?? []).includes(uid);
}

/** Answered or passed this question; the speaker whose minute ran out counts without a write. */
export function hasAnswered(table: ClassTable, uid: string, now: number): boolean {
	if (table.spokenUids.includes(uid)) return true;

	return (
		table.speakerUid === uid && speakerTimeOver(table, now) && table.speakerEndsAt !== undefined
	);
}

export function tableTalkState(table: ClassTable, uid: string, now: number): TableTalkState {
	if (tableDone(table, now)) return 'D';
	if (isLegacyTail(table) || choosing(table, now)) return doneAsking(table, uid) ? 'P2' : 'P1';
	if (!speakerTimeOver(table, now)) return table.speakerUid === uid ? 'S' : 'L';
	if (hasAnswered(table, uid, now)) return 'H';
	if (table.askerUid === uid && !askerMayAnswer(table, now)) return 'W';

	return 'A';
}

/** Did I pass this question (not answered it)? */
export function passedAnswer(table: ClassTable, uid: string): boolean {
	return (table.passedSpeakingUids ?? []).includes(uid);
}

/** The talk is running or open: the question belongs on the screen (S, L, W, A, H). */
export function isTalkState(state: TableTalkState): boolean {
	return state === 'S' || state === 'L' || state === 'W' || state === 'A' || state === 'H';
}
