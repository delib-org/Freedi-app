import { Dispatch } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import { answerPublished } from '@/redux/answerNotifyPrompt/answerNotifyPromptSlice';

/**
 * Add paths report "answer published" here and nothing more; the prompt host
 * mounted once in App decides whether to ask. Only an answer (option) under a
 * question counts. Hosts seeding answers (bulk add, cluster duplicates, mind-map
 * placeholders) and supporting a similar answer never call this.
 */
export function announceAnswerPublished(
	dispatch: Dispatch,
	answerId: string,
	parent: Statement | 'top' | null | undefined,
): boolean {
	if (!answerId || !parent || parent === 'top') return false;
	if (parent.statementType !== StatementType.question) return false;

	dispatch(answerPublished({ questionId: parent.statementId, answerId }));

	return true;
}
