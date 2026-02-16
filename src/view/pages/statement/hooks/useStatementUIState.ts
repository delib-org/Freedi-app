import { useState, useCallback } from 'react';
import { StatementType, QuestionType, User } from '@freedi/shared-types';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';

export const useStatementUIState = () => {
	// Local state
	const [talker, setTalker] = useState<User | null>(null);
	const [isStatementNotFound, setIsStatementNotFound] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newStatementType, setNewStatementType] = useState<StatementType>(StatementType.group);
	const [newQuestionType, setNewQuestionType] = useState<QuestionType>(getDefaultQuestionType());

	const handleShowTalker = useCallback((user: User | null) => {
		setTalker((prev) => (prev ? null : user));
	}, []);

	const resetError = useCallback(() => {
		setError(null);
	}, []);

	return {
		// State
		talker,
		isStatementNotFound,
		error,
		newStatementType,
		newQuestionType,
		// Setters
		setTalker,
		setIsStatementNotFound,
		setError,
		setNewStatementType,
		setNewQuestionType,
		// Actions
		handleShowTalker,
		resetError,
	};
};
