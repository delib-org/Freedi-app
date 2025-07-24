import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
	selectUserDataByStatementId,
	selectUserQuestionsByStatementId,
} from '@/redux/userData/userDataSlice';

export const useUserData = (statementId: string) => {
	const userDataQuestions = useSelector(
		selectUserQuestionsByStatementId(statementId)
	);
	const userData = useSelector(
		selectUserDataByStatementId(statementId)
	);

	const showUserQuestions = useMemo(() =>
		userDataQuestions &&
		userDataQuestions.length > 0 &&
		userData.length < userDataQuestions.length,
		[userDataQuestions, userData]
	);

	return useMemo(() => ({
		userDataQuestions,
		userData,
		showUserQuestions
	}), [userDataQuestions, userData, showUserQuestions]);
};
