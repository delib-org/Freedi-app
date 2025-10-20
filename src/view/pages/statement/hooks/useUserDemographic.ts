import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
	selectUserDemographicByStatementId,
	selectUserDemographicQuestionsByStatementId,
} from '@/redux/userDemographic/userDemographicSlice';

export const useUserDemographic = (statementId: string) => {
	const userDemographicQuestions = useSelector(
		selectUserDemographicQuestionsByStatementId(statementId)
	);
	const userDemographic = useSelector(
		selectUserDemographicByStatementId(statementId)
	);

	const showUserDemographicQuestions = useMemo(() => {
		const hasQuestions = userDemographicQuestions && userDemographicQuestions.length > 0;
		const hasUnansweredQuestions = hasQuestions && userDemographic.length < userDemographicQuestions.length;

		// Debug logging
		if (hasQuestions) {
			console.info('User demographic survey check:', {
				totalQuestions: userDemographicQuestions.length,
				answeredQuestions: userDemographic.length,
				shouldShowSurvey: hasUnansweredQuestions,
				questions: userDemographicQuestions,
				answers: userDemographic
			});
		}

		return hasUnansweredQuestions;
	}, [userDemographicQuestions, userDemographic]);

	return useMemo(() => ({
		userDemographicQuestions,
		userDemographic,
		showUserDemographicQuestions
	}), [userDemographicQuestions, userDemographic, showUserDemographicQuestions]);
};
