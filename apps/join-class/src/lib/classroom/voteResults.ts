import type { ClassVoteDisplay, Statement } from '@freedi/shared-types';

/**
 * What the students' vote screen shows of the running vote. Pure, so each rule
 * is unit-testable. The only source is the challenge question's `selections{}`
 * (vote counts per proposal, kept by the fn_vote trigger): an aggregate, never
 * who voted for what.
 */

const PERCENT = 100;

export interface VoteResult {
	count: number;
	/** 0..100: this proposal's share of the votes cast on the ballot. */
	percent: number;
}

function displayOf(challenge: Statement | null | undefined): ClassVoteDisplay {
	return challenge?.statementSettings?.voteDisplay ?? {};
}

/** The teacher's "students see live results" switch. On unless switched off. */
export function liveResultsOn(challenge: Statement | null | undefined): boolean {
	return displayOf(challenge).liveResults !== false;
}

/** The teacher's "order the proposals by support" switch. Off unless switched on. */
export function sortBySupportOn(challenge: Statement | null | undefined): boolean {
	return displayOf(challenge).sortBySupport === true;
}

/**
 * The ballot ordered by votes, most on top. Ties keep the order the student
 * already sees (`previous`; the ballot's own order for ids not in it), so a
 * card moves only when it really overtakes another, never on an equal count.
 */
export function orderBySupport(
	candidateIds: readonly string[],
	results: Record<string, VoteResult>,
	previous: readonly string[],
): string[] {
	const wanted = new Set(candidateIds);
	const seen = previous.filter((id) => wanted.has(id));
	const known = new Set(seen);
	const base = [...seen, ...candidateIds.filter((id) => !known.has(id))];
	const rank = new Map(base.map((id, index) => [id, index]));
	const votes = (id: string): number => results[id]?.count ?? 0;

	return [...base].sort((a, b) => votes(b) - votes(a) || (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

function countOf(selections: Record<string, number> | undefined, id: string): number {
	const value = selections?.[id];

	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Each candidate's votes and share of all votes on the ballot. Withdrawals
 * ('none') and options off the ballot do not count; no votes yet = 0% each.
 */
export function voteResults(
	candidateIds: readonly string[],
	selections: Record<string, number> | undefined,
): Record<string, VoteResult> {
	const counts = candidateIds.map((id) => [id, countOf(selections, id)] as const);
	const total = counts.reduce((sum, [, count]) => sum + count, 0);

	return Object.fromEntries(
		counts.map(([id, count]) => [
			id,
			{ count, percent: total === 0 ? 0 : Math.round((count / total) * PERCENT) },
		]),
	);
}
