import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
	selectEffectiveQuestions,
} from '@/redux/userDemographic/userDemographicSlice';
import { RootState } from '@/redux/types';

// Use string literal for scope until delib-npm exports the enum value
const DEMOGRAPHIC_SCOPE_GROUP = 'group' as const;

export const useUserDemographic = (statementId: string, topParentId?: string) => {
	// Use effective questions selector which combines group + statement questions
	const effectiveTopParentId = topParentId || statementId;
	const userDemographicQuestions = useSelector(
		selectEffectiveQuestions(statementId, effectiveTopParentId)
	);

	// Get user's answers - both group-level and statement-level
	const userDemographic = useSelector((state: RootState) => {
		const allAnswers = state.userDemographic.userDemographic;

		// Filter answers that match either:
		// 1. Group-level answers for this topParentId
		// 2. Statement-level answers for this statementId
		return allAnswers.filter(answer =>
			(answer.topParentId === effectiveTopParentId && answer.scope === DEMOGRAPHIC_SCOPE_GROUP) ||
			(answer.statementId === statementId && answer.scope !== DEMOGRAPHIC_SCOPE_GROUP)
		);
	});

	const showUserDemographicQuestions = useMemo(() => {
		const hasQuestions = userDemographicQuestions && userDemographicQuestions.length > 0;

		if (!hasQuestions) return false;

		// Check if there are unanswered questions by comparing question IDs
		const answeredQuestionIds = new Set(userDemographic.map(a => a.userQuestionId));
		const hasUnansweredQuestions = userDemographicQuestions.some(
			q => !answeredQuestionIds.has(q.userQuestionId)
		);

		return hasUnansweredQuestions;
	}, [userDemographicQuestions, userDemographic]);

	return useMemo(() => ({
		userDemographicQuestions,
		userDemographic,
		showUserDemographicQuestions
	}), [userDemographicQuestions, userDemographic, showUserDemographicQuestions]);
};
