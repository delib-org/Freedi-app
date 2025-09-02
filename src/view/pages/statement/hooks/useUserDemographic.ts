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

	const showUserDemographicQuestions = useMemo(() =>
		userDemographicQuestions &&
		userDemographicQuestions.length > 0 &&
		userDemographic.length < userDemographicQuestions.length,
		[userDemographicQuestions, userDemographic]
	);

	return useMemo(() => ({
		userDemographicQuestions,
		userDemographic,
		showUserDemographicQuestions
	}), [userDemographicQuestions, userDemographic, showUserDemographicQuestions]);
};
