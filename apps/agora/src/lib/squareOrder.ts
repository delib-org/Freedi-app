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
