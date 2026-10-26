import { StatementType } from '@freedi/shared-types';
import type { ClassBallot, Statement } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Pure logic behind `classSetItemHidden` (IA 18.4): what may be hidden, and
 * what hiding a ballot candidate does to the ballot.
 */

/** The vote value that means "no choice"; fn_vote moves the count off the old option. */
export const WITHDRAWN_VOTE = 'none';

export type HideableKind = 'option' | 'question' | 'reply';

/**
 * An answer or proposal (an option under one of the lesson's questions), a
 * table's own question (a question under the lesson that carries a table
 * marker), or a reply on a proposal (IA 22: a marked statement under an option
 * whose question — `grandparent` — is the lesson's). Anything else is refused.
 */
export function classifyHideable(
	item: Statement | undefined,
	parent: Statement | undefined,
	mainId: string,
	grandparent?: Statement,
): HideableKind {
	if (item?.statementType === StatementType.statement && item.classReply !== undefined) {
		if (
			parent?.statementType === StatementType.option &&
			grandparent?.statementType === StatementType.question &&
			grandparent.statementId === parent.parentId &&
			grandparent.parentId === mainId
		) {
			return 'reply';
		}
	} else if (item?.statementType === StatementType.option) {
		if (parent?.statementType === StatementType.question && parent.parentId === mainId) {
			return 'option';
		}
	} else if (
		item?.statementType === StatementType.question &&
		item.parentId === mainId &&
		item.classTable !== undefined
	) {
		return 'question';
	}
	throw new ClassroomError(
		'invalid-argument',
		'Only an answer, a proposal, a table question or a reply of this lesson can be hidden',
	);
}

/** True when hiding `statementId` touches the ballot: it is one of its candidates. */
export function isBallotCandidate(ballot: ClassBallot | undefined, statementId: string): boolean {
	return ballot?.candidateIds.includes(statementId) === true;
}

/**
 * The ballot without `statementId`. A closed ballot refuses (reset the vote
 * first) and so does removing the last candidate.
 */
export function ballotWithout(ballot: ClassBallot, statementId: string): ClassBallot {
	if (typeof ballot.closedAt === 'number') {
		throw new ClassroomError(
			'failed-precondition',
			'This proposal is on a closed vote. Reset the vote first',
			'vote-closed',
		);
	}
	const remaining = ballot.candidateIds.filter((id) => id !== statementId);
	if (remaining.length === 0) {
		throw new ClassroomError(
			'failed-precondition',
			'The last proposal on the vote cannot be hidden',
			'last-candidate',
		);
	}

	return { ...ballot, candidateIds: remaining };
}
