import type { Statement } from '@freedi/shared-types';

/**
 * True while the server's language check is what keeps this answer hidden.
 * Only the question's host may restore it (firestore.rules), so authors, who
 * can normally unhide their own answers, must not be offered the button.
 */
export function isHiddenByAutomaticCheck(statement: Statement): boolean {
	return statement.hide === true && 'answerModeration' in statement;
}
