/**
 * The ballot's live order: most supported first.
 *
 * The candidates themselves are frozen when the stage opens (a class must
 * not watch the ballot CHANGE while it votes), but their ORDER follows the
 * count, so the room can see the race. Every candidate keeps the number it
 * was given on the ballot — proposals are known by number in this game, and
 * a number that moved with the rank would stop meaning "that one".
 *
 * Stable: candidates on equal votes stay in ballot order, so nothing
 * shuffles on a tie and nothing moves until a vote actually lands.
 */

export interface RankedCandidate<C> {
	candidate: C;
	/** The candidate's number on the ballot, 1-based, fixed for the stage */
	number: number;
	votes: number;
}

export function rankBallot<C extends { statementId: string }>(
	candidates: readonly C[],
	selections: Readonly<Record<string, number>>,
): RankedCandidate<C>[] {
	return candidates
		.map((candidate, index) => ({
			candidate,
			number: index + 1,
			votes: selections[candidate.statementId] ?? 0,
		}))
		.sort((a, b) => b.votes - a.votes || a.number - b.number);
}

/** One string per order — equal strings, nothing moved */
export function ballotOrderKey<C extends { statementId: string }>(
	ranked: readonly RankedCandidate<C>[],
): string {
	return ranked.map((entry) => entry.candidate.statementId).join('|');
}
