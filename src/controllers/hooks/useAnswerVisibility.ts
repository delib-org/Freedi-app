import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { selectSubscriptionMap } from '@/redux/statements/statementsSlice';
import { AnswerHostContext, canSeeAnswer } from '@/helpers/answerModeration';
import { useShowHiddenCards } from './useShowHiddenCards';

/** The viewer's host standing, from state the app already holds. No reads. */
export function useAnswerHostContext(): AnswerHostContext {
	const creator = useSelector(creatorSelector);
	const subscriptionsByStatementId = useSelector(selectSubscriptionMap);
	const userId = creator?.uid;
	const isSystemAdmin = creator?.systemAdmin === true;

	return useMemo(
		() => ({ userId, isSystemAdmin, subscriptionsByStatementId }),
		[userId, isSystemAdmin, subscriptionsByStatementId],
	);
}

/** The filter for a screen that lists answers. */
export function useCanSeeAnswer(): (answer: Statement) => boolean {
	const context = useAnswerHostContext();
	const { showHiddenCards } = useShowHiddenCards();

	return useCallback(
		(answer: Statement) => canSeeAnswer(answer, context, showHiddenCards),
		[context, showHiddenCards],
	);
}
