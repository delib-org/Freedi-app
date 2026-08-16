import type { AgoraProposalScore } from '@freedi/shared-types';

/**
 * What the square needs from a proposal to place it in the row. Narrower than
 * AgoraProposal on purpose: the ordering rule may read a writing clock and an
 * id, and nothing else — no ratings, no consensus, no aggregate.
 */
export interface OrderableProposal {
	statementId: string;
	creatorId: string;
	createdAt: number;
}

/** Deterministic per-student shuffle so classmates fan out over different proposals */
export function studentOrder(userId: string, statementId: string): number {
	const seed = `${userId}--${statementId}`;
	let hash = 0;
	for (let index = 0; index < seed.length; index++) {
		hash = (hash * 31 + seed.charCodeAt(index)) | 0;
	}

	return hash;
}

/**
 * The square's row order: freshest WRITING first.
 *
 * Two clocks, both of them the author's own hand — they posted (createdAt) or
 * they rewrote (agoraScores.lastEditAt, stamped server-side on a real text
 * change). Rating is deliberately not one of them, and neither is the
 * statement's `lastUpdate`: the evaluation pipeline bumps that on every
 * aggregate write, so ordering on it reshuffled the whole square each time
 * anybody anywhere pressed a face. Rows moved under a reading finger for a
 * reason the reader could not see.
 *
 * Ties break on the per-student shuffle, so two proposals posted in the same
 * millisecond still fan the class out instead of piling everyone onto one.
 */
export function orderSquare<T extends OrderableProposal>(
	proposals: readonly T[],
	scores: Readonly<Record<string, Partial<Pick<AgoraProposalScore, 'lastEditAt'>>>>,
	userId: string,
): T[] {
	const writtenAt = (proposal: T): number =>
		scores[proposal.statementId]?.lastEditAt ?? proposal.createdAt;

	return proposals
		.filter((proposal) => proposal.creatorId !== userId)
		.slice()
		.sort(
			(a, b) =>
				writtenAt(b) - writtenAt(a) ||
				studentOrder(userId, a.statementId) - studentOrder(userId, b.statementId),
		);
}

/** What the stall row needs to know about a proposal beyond its identity. */
export interface StallRankInputs {
	/** Unresolved ideas already waiting on this proposal's owner. */
	openIdeas: (statementId: string) => number;
	/** Have I already sent an idea here? */
	mine: (statementId: string) => boolean;
}

/**
 * The order a lap deals classmates' proposals in.
 *
 * Three rules, in this order, and each is about spreading the class's attention
 * rather than ranking the work:
 *
 *  1. proposals I have NOT helped come first — my second idea on the same text
 *     is worth less to the class than my first idea on a text nobody has read;
 *  2. then the ones with the fewest ideas already waiting, so help lands where
 *     there is none rather than piling onto whoever got noticed first;
 *  3. then the per-student shuffle, so two equally-neglected proposals do not
 *     send the entire class to the same one.
 *
 * Computed once per lap by the caller and held steady after that — see
 * `mergeLateArrivals` for what happens to someone who posts mid-lap.
 */
export function rankStalls<T extends OrderableProposal>(
	others: readonly T[],
	userId: string,
	inputs: StallRankInputs,
): string[] {
	return others
		.slice()
		.sort(
			(a, b) =>
				Number(inputs.mine(a.statementId)) - Number(inputs.mine(b.statementId)) ||
				inputs.openIdeas(a.statementId) - inputs.openIdeas(b.statementId) ||
				studentOrder(userId, a.statementId) - studentOrder(userId, b.statementId),
		)
		.map((proposal) => proposal.statementId);
}

/**
 * A classmate who posts mid-lap joins the END of the row.
 *
 * Not re-sorted in: a row that reshuffles under a reading finger costs the
 * reader their place for a reason they cannot see. The next lap re-ranks
 * everything anyway.
 */
export function mergeLateArrivals<T extends OrderableProposal>(
	order: readonly string[],
	others: readonly T[],
): string[] {
	const merged = [...order];
	const known = new Set(order);
	for (const proposal of others) {
		if (!known.has(proposal.statementId)) merged.push(proposal.statementId);
	}

	return merged;
}
