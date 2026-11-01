import type { Statement } from '@freedi/shared-types';

/**
 * "Only proposals above the goal": the teacher's switch for which proposals the
 * vote opens with (the server freezes ballot.candidateIds from it; phones,
 * projector and Summary all read that one set). A proposal has entered the goal when its C_p
 * (statement.consensus) reaches the lesson's gate. Pure, so each rule is
 * unit-testable. (Trello OaZEhcB7.)
 */

function displayOf(challenge: Statement | null | undefined): { onlyAboveGate?: boolean } {
	return challenge?.statementSettings?.voteDisplay ?? {};
}

/**
 * The teacher's choice, read when the vote opens (the server freezes the
 * ballot from it). On unless switched to All: only the proposals above the
 * goal (with the server's top-proposals fallback when fewer than two are).
 */
export function onlyAboveGateOn(challenge: Statement | null | undefined): boolean {
	return displayOf(challenge).onlyAboveGate !== false;
}

/** Fewer than this many above the goal: the server keeps the top proposals instead. */
export const MIN_ABOVE_GOAL = 2;

/** True when this proposal's C_p has reached the gate (unrated = not yet). */
export function enteredGoal(option: Statement | undefined, gate: number): boolean {
	return typeof option?.consensus === 'number' && option.consensus >= gate;
}

/** Ids (in the given order) whose proposal has C_p at or above the gate. */
export function aboveGateIds(
	ids: readonly string[],
	proposals: readonly Statement[],
	gate: number,
): string[] {
	const byId = new Map(proposals.map((option) => [option.statementId, option]));

	return ids.filter((id) => enteredGoal(byId.get(id), gate));
}

export interface ScopeCounts {
	/** Proposals on the ballot. */
	total: number;
	/** Of those, the ones that entered the goal. */
	above: number;
}

export function scopeCounts(
	ids: readonly string[],
	proposals: readonly Statement[],
	gate: number,
): ScopeCounts {
	return { total: ids.length, above: aboveGateIds(ids, proposals, gate).length };
}
