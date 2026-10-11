/**
 * What a student's board shows once notes are dealt by lottery, and when the
 * client should ask the server for more.
 *
 * Pure: no Mithril, no Firestore. `lib/hands.ts` feeds it the hand streamed
 * from `agoraHands`, the notes the listener holds and what I have rated; the
 * views draw what comes back. The deal itself is `planDeal` in shared-types —
 * the server's call. This file only decides visibility and the asking.
 *
 * The square's rule from the old sessionStorage deal still holds: cards never
 * reorder under a reading finger. A note I was dealt keeps its place in the
 * hand's order; newcomers append.
 */

import { AGORA_LOTTERY } from '@freedi/shared-types';

export interface HandNote {
	statementId: string;
	creatorId: string;
	evaluation?: { numberOfEvaluators?: number } | null;
}

export interface VisibleNotesInput<T extends HandNote> {
	/** Every note under the station, in the listener's (createdAt) order */
	notes: readonly T[];
	userId: string;
	/** My hand for this station, in deal order */
	hand: readonly string[];
	/** Ids I have rated anywhere */
	rated: ReadonlySet<string>;
	/** The class is large enough for the lottery */
	active: boolean;
	/** The station still takes ratings; a closed one shows everything */
	live: boolean;
}

/**
 * Mine, what I was dealt, and what I already rated — or everything when the
 * lottery is off or the station has closed. Notes outside the hand (mine,
 * ratings from before the lottery switched on) keep the listener's order and
 * come first; the hand follows in deal order.
 */
export function visibleNotes<T extends HandNote>(input: VisibleNotesInput<T>): T[] {
	if (!input.active || !input.live) return [...input.notes];
	const held = new Set(input.hand);
	const byId = new Map(input.notes.map((note) => [note.statementId, note]));
	const outside = input.notes.filter(
		(note) =>
			!held.has(note.statementId) &&
			(note.creatorId === input.userId || input.rated.has(note.statementId)),
	);
	const dealt = input.hand
		.map((statementId) => byId.get(statementId))
		.filter((note): note is T => note !== undefined);

	return [...outside, ...dealt];
}

export interface HandStatus {
	/** Notes in the hand I have rated */
	ratedCount: number;
	/** Notes in the hand */
	total: number;
	/** The hand is non-empty and rated through */
	finished: boolean;
}

export function handStatus(hand: readonly string[], rated: ReadonlySet<string>): HandStatus {
	const ratedCount = hand.filter((statementId) => rated.has(statementId)).length;

	return {
		ratedCount,
		total: hand.length,
		finished: hand.length > 0 && ratedCount === hand.length,
	};
}

export interface FillAskInput {
	active: boolean;
	live: boolean;
	/** I have written my own note here — the board is for readers who wrote */
	hasMine: boolean;
	hand: readonly string[];
	rated: ReadonlySet<string>;
	/** Classmates' notes I hold neither in the hand nor among my ratings */
	dealable: number;
}

/**
 * Whether a `fill` could change anything: the hand is short, or it is rated
 * through and something is left to deal. The server decides what actually
 * comes; this only spares it the calls that cannot matter.
 */
export function shouldRequestFill(input: FillAskInput): boolean {
	if (!input.active || !input.live || !input.hasMine) return false;
	if (input.dealable <= 0) return false;
	if (input.hand.length < AGORA_LOTTERY.HAND_SIZE) return true;

	return handStatus(input.hand, input.rated).finished;
}

/**
 * The shape of the moment a fill was asked for. The same shape asked twice
 * means nothing changed since the server last answered — a note that still
 * has enough readers will not become under-read by asking again.
 */
export function fillFingerprint(input: Pick<FillAskInput, 'hand' | 'rated' | 'dealable'>): string {
	const { ratedCount } = handStatus(input.hand, input.rated);

	return `${input.hand.length}:${ratedCount}:${input.dealable}`;
}

/** How many classmates' notes could still be dealt to me */
export function dealableCount<T extends HandNote>(
	notes: readonly T[],
	userId: string,
	hand: readonly string[],
	rated: ReadonlySet<string>,
): number {
	const held = new Set(hand);

	return notes.filter(
		(note) =>
			note.creatorId !== userId && !held.has(note.statementId) && !rated.has(note.statementId),
	).length;
}

export interface Coverage {
	/** Notes with at least MIN_RATERS raters */
	covered: number;
	total: number;
}

/** The teacher's line: how many notes have enough readers to be worth a number */
export function coverage<T extends HandNote>(
	notes: readonly T[],
	min: number = AGORA_LOTTERY.MIN_RATERS,
): Coverage {
	const covered = notes.filter((note) => (note.evaluation?.numberOfEvaluators ?? 0) >= min).length;

	return { covered, total: notes.length };
}
