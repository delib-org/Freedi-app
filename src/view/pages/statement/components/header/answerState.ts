import { Statement, StatementType } from '@freedi/shared-types';

export type AnswerState = 'none' | 'notChosen' | 'chosen';

/**
 * Where an answer stands, for the strip under the header bar.
 *
 * "Chosen" uses the rule the Answers cards already use for their selected
 * look: the answer is in its parent's `results` array. A parent that is not in
 * Redux yet (deep link) reads as not chosen until it arrives.
 */
export function getAnswerState(
	statement: Statement | undefined,
	parentStatement: Statement | undefined,
): AnswerState {
	if (statement?.statementType !== StatementType.option) return 'none';

	const isChosen =
		parentStatement?.results?.some((result) => result.statementId === statement.statementId) ??
		false;

	return isChosen ? 'chosen' : 'notChosen';
}
