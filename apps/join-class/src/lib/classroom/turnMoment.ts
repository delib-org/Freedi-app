import type { ClassTable, TableStep } from '@freedi/shared-types';
import type { Mate } from './c3Logic';

/**
 * Small pure rules shared by the table screens: the turn count in the header,
 * the Proposals instruction, names, and the reason a callable was refused. The
 * eight states of Table talk live in tableTalkState.ts. No Firebase, no DOM.
 */

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

/** The one instruction of a Proposals step (talk, write, rate). */
export function instructionFor(step: TableStep): Instruction {
	if (step === 'talk') return { key: 'turn.instr_talk' };

	return { key: step === 'write' ? 'turn.instr_write_proposals' : 'turn.instr_rate_proposals' };
}

/** The not-yet tablemates' names, in the order given. */
export function namesOf(
	uids: readonly string[],
	mates: readonly Mate[],
	someone: string,
): string[] {
	return uids.map((uid) => mates.find((mate) => mate.uid === uid)?.name ?? someone);
}

/** Why a call was refused, when the engine says it (HttpsError `details.reason`). */
export function refusalReason(error: unknown): string | null {
	if (typeof error !== 'object' || error === null || !('details' in error)) return null;
	const details = (error as { details?: unknown }).details;
	if (typeof details !== 'object' || details === null || !('reason' in details)) return null;
	const reason = (details as { reason?: unknown }).reason;

	return typeof reason === 'string' ? reason : null;
}

/**
 * Refusals that only mean "someone was first": the table doc already shows the
 * winner, so the client swallows them (a quiet line names who won).
 */
export const RACE_REASONS: ReadonlySet<string> = new Set([
	'turn-claimed',
	'floor-taken',
	'talk-not-over',
	'already-asked',
	'already-passed',
	'already-answered',
	'others-first',
	'minute-over',
	'not-speaker',
]);

/** Is this refusal one the screen swallows? */
export function isRaceRefusal(error: unknown): boolean {
	const reason = refusalReason(error);

	return reason !== null && RACE_REASONS.has(reason);
}
