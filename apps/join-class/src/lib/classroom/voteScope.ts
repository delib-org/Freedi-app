import type { Statement } from '@freedi/shared-types';

/**
 * "Only proposals above the goal": which of the ballot's proposals the vote
 * screen and the projector show. A proposal has entered the goal when its C_p
 * (statement.consensus) reaches the lesson's gate. Pure, so each rule is
 * unit-testable. (Trello OaZEhcB7.)
 */

function displayOf(challenge: Statement | null | undefined): { onlyAboveGate?: boolean } {
	return challenge?.statementSettings?.voteDisplay ?? {};
}

/** The teacher's choice; off (all proposals) unless switched on. */
export function onlyAboveGateOn(challenge: Statement | null | undefined): boolean {
	return displayOf(challenge).onlyAboveGate === true;
}

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

export interface ScopedIds {
	ids: string[];
	/** The teacher asked for "only above the goal" but none is above it: all are kept. */
	fellBack: boolean;
}

/** The ids to show. Nothing above the goal keeps All, never an empty vote. */
export function scopedIds(
	ids: readonly string[],
	proposals: readonly Statement[],
	gate: number,
	onlyAbove: boolean,
): ScopedIds {
	if (!onlyAbove) return { ids: [...ids], fellBack: false };
	const above = aboveGateIds(ids, proposals, gate);
	if (above.length === 0) return { ids: [...ids], fellBack: ids.length > 0 };

	return { ids: above, fellBack: false };
}
