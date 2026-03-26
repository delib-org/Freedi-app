import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import { statementSubsSelector, statementSelectorById } from '@/redux/statements/statementsSlice';

interface UseCompoundSolutionsReturn {
	solutionQuestion: Statement | undefined;
	solutions: Statement[];
	hasSolutionQuestion: boolean;
}

export function useCompoundSolutions(statement: Statement | undefined): UseCompoundSolutionsReturn {
	const solutionQuestionId =
		statement?.questionSettings?.compoundSettings?.solutionQuestionId ?? '';

	const solutionQuestion = useSelector(statementSelectorById(solutionQuestionId));
	const solutionChildren = useSelector(statementSubsSelector(solutionQuestionId));

	const solutions = useMemo(
		() =>
			solutionChildren
				.filter((child: Statement) => child.statementType === StatementType.option)
				.sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0)),
		[solutionChildren],
	);

	return {
		solutionQuestion,
		solutions,
		hasSolutionQuestion: !!solutionQuestion,
	};
}
