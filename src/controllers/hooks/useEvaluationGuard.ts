import { Statement } from '@freedi/shared-types';
import { useAppSelector } from './reduxHooks';
import { userSuggestionsSelector, statementSelector } from '@/redux/statements/statementsSlice';
import { useAuthentication } from './useAuthentication';

interface UseEvaluationGuardReturn {
	canEvaluate: boolean;
	requiresSolution: boolean;
	hasSubmittedSolution: boolean;
}

export function useEvaluationGuard(statement: Statement): UseEvaluationGuardReturn {
	const { creator } = useAuthentication();

	// Get parent statement to check settings
	const parentStatement = useAppSelector(
		statementSelector(statement.parentId || statement.statementId),
	);

	// Get user's solutions for this question
	const userSolutions = useAppSelector(
		userSuggestionsSelector(statement.parentId || statement.statementId, creator?.uid),
	);

	// Check if the parent statement requires solution before evaluation
	const requiresSolution =
		parentStatement?.questionSettings?.askUserForASolutionBeforeEvaluation || false;

	// Check if user has submitted at least one solution
	const hasSubmittedSolution = userSolutions.length > 0;

	// User can evaluate if:
	// 1. The setting is not enabled, OR
	// 2. The setting is enabled AND user has submitted a solution
	const canEvaluate = !requiresSolution || hasSubmittedSolution;

	return {
		canEvaluate,
		requiresSolution,
		hasSubmittedSolution,
	};
}
