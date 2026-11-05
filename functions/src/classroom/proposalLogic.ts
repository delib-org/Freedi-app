import { CLASS_PROPOSAL_MAX_LENGTH, StatementType, mayAddProposal } from '@freedi/shared-types';
import type { ClassProposalLimit, Statement } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Pure logic behind `classPostProposal` / `classEditProposal` (IA 24.3): what a
 * proposal may say, whose it is, and when it may still change.
 */

/** The trimmed text of a proposal, or a refusal: empty, or longer than CLASS_PROPOSAL_MAX_LENGTH. */
export function cleanProposalText(value: unknown): string {
	if (typeof value !== 'string') throw new ClassroomError('invalid-argument', 'text is required');
	const text = value.trim();
	if (text.length === 0) throw new ClassroomError('invalid-argument', 'text is required');
	if (text.length > CLASS_PROPOSAL_MAX_LENGTH) {
		throw new ClassroomError('invalid-argument', 'The proposal is too long', 'proposal-too-long');
	}

	return text;
}

/** Proposals change only until the vote opens: a frozen (or later closed) ballot refuses. */
export function assertBallotNotFrozen(challenge: Statement): void {
	if (challenge.statementSettings?.ballot !== undefined) {
		throw new ClassroomError(
			'failed-precondition',
			'The vote has opened: proposals can no longer change',
			'vote-running',
		);
	}
}

/**
 * The proposal a student edits: an option under the lesson's challenge question,
 * written by the caller, not hidden by the teacher. The teacher may edit any
 * visible one.
 */
export function assertEditableProposal(
	proposal: Statement | undefined,
	challengeId: string,
	actorUid: string,
	teacher: boolean,
): asserts proposal is Statement {
	const ok =
		proposal?.statementType === StatementType.option &&
		proposal.parentId === challengeId &&
		proposal.hide !== true &&
		(teacher || proposal.creatorId === actorUid);
	if (!ok) {
		throw new ClassroomError('permission-denied', 'Only the writer can change this proposal');
	}
}

/**
 * Every proposal this author wrote under the challenge. Hidden ones count: the
 * teacher hiding a proposal does not hand its author another one.
 */
export function ownProposalsOf(
	options: readonly Statement[],
	challengeId: string,
	authorId: string,
): Statement[] {
	return options.filter(
		(o) =>
			o.statementType === StatementType.option &&
			o.parentId === challengeId &&
			o.creatorId === authorId,
	);
}

/** The lesson's proposal limit, by author: nothing is ever deleted when it is lowered, only adding stops. */
export function assertMayAddProposal(limit: ClassProposalLimit, held: number): void {
	if (!mayAddProposal(limit, held)) {
		throw new ClassroomError(
			'failed-precondition',
			'You already have a proposal: edit it',
			'already-proposed',
		);
	}
}
