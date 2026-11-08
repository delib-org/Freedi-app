import type { ClassProposalLimit, Statement } from '@freedi/shared-types';

/**
 * What a phone's write box does under the lesson's proposal limit. The server
 * decides what is written (classPostProposal); this only keeps the box honest, so
 * a draft is never sent as an edit of a proposal it was not written for.
 */

export type WriteTarget =
	/** The box writes a new proposal. */
	| { kind: 'new' }
	/** The box edits this proposal. */
	| { kind: 'edit'; proposal: Statement }
	/** The limit went down mid-draft: the text stays, it cannot be sent as a new proposal. */
	| { kind: 'blocked' };

export interface WriteTargetInput {
	limit: ClassProposalLimit;
	/** The author's proposals, newest first (`myProposals`). */
	mine: readonly Statement[];
	/** The proposal the student chose to edit, if any. */
	editId: string | null;
	/** Text is waiting in the draft of a NEW proposal. */
	hasNewDraft: boolean;
}

export function writeTargetOf({ limit, mine, editId, hasNewDraft }: WriteTargetInput): WriteTarget {
	const chosen = editId ? mine.find((p) => p.statementId === editId) : undefined;
	if (chosen) return { kind: 'edit', proposal: chosen };
	if (limit === 'unlimited' || mine.length === 0) return { kind: 'new' };

	return hasNewDraft ? { kind: 'blocked' } : { kind: 'edit', proposal: mine[0] };
}

/**
 * The draft key of what the box is writing. A new proposal keeps the lesson's id,
 * an edit gets its own: an edit's words can never be restored as a new proposal,
 * nor a new proposal's words as an edit of something else.
 */
export function proposalDraftScope(mainId: string, target: WriteTarget): string {
	return target.kind === 'edit' ? `${mainId}:${target.proposal.statementId}` : mainId;
}

/** Own proposals shown as cards beside the box; the one in the box is not repeated. */
export function otherOwnProposals(mine: readonly Statement[], target: WriteTarget): Statement[] {
	return target.kind === 'edit'
		? mine.filter((p) => p.statementId !== target.proposal.statementId)
		: [...mine];
}

/** The box alone tells the story only for one author with one proposal under the one-proposal limit. */
export function showsOwnProposalList(
	limit: ClassProposalLimit,
	mine: readonly Statement[],
	target: WriteTarget,
): boolean {
	if (target.kind === 'blocked') return true;
	if (limit === 'unlimited') return mine.length > 0;

	return mine.length > 1;
}
