import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';

interface UseCompoundSubQuestionsReturn {
	subQuestions: Statement[];
	lockedSubQuestions: Statement[];
	unlockedSubQuestions: Statement[];
}

export function useCompoundSubQuestions(
	statement: Statement | undefined,
): UseCompoundSubQuestionsReturn {
	const children = useSelector(statementSubsSelector(statement?.statementId ?? ''));
	const solutionQuestionId = statement?.questionSettings?.compoundSettings?.solutionQuestionId;

	const subQuestions = useMemo(
		() =>
			children
				.filter(
					(child: Statement) =>
						child.statementType === StatementType.question &&
						child.statementId !== solutionQuestionId,
				)
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
		[children, solutionQuestionId],
	);

	const lockedSubQuestions = useMemo(
		() => subQuestions.filter((sq: Statement) => sq.locked?.isLocked),
		[subQuestions],
	);

	const unlockedSubQuestions = useMemo(
		() => subQuestions.filter((sq: Statement) => !sq.locked?.isLocked),
		[subQuestions],
	);

	return {
		subQuestions,
		lockedSubQuestions,
		unlockedSubQuestions,
	};
}
