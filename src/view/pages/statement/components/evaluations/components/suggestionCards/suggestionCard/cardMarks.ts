import { Statement } from '@freedi/shared-types';

export interface CardMarks {
	showVotingWinner: boolean;
	showInResults: boolean;
}

/**
 * The "in results" and voting-winner marks say how an answer is doing, so they
 * follow the score guard. Without it the card keeps a plain, unmarked look.
 */
export function resolveCardMarks(
	statement: Statement,
	parentStatement: Statement | undefined,
	canSeeMarks: boolean,
): CardMarks {
	if (!canSeeMarks) return { showVotingWinner: false, showInResults: false };

	return {
		showVotingWinner: parentStatement?.topVotedOption?.statementId === statement.statementId,
		showInResults:
			parentStatement?.results?.some((result) => result.statementId === statement.statementId) ??
			false,
	};
}
