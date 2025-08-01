import React, { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { StatementContext } from '../StatementCont';
import { StatementContent } from './StatementContent';
import { setShowNewStatementModal } from '@/redux/statements/newStatementSlice';
import { Statement, User, Role, StatementType, QuestionType, UserQuestion } from 'delib-npm';

interface StatementProviderProps {
	statement: Statement | null;
	stage: Statement | null;
	topParentStatement: Statement | null;
	talker: User | null;
	role: Role | undefined;
	newStatementType: StatementType;
	newQuestionType: QuestionType;
	showNewStatement: boolean;
	showUserQuestions: boolean;
	userDataQuestions: UserQuestion[] | null;
	screen?: string;
	isMassConsensus: boolean;
	handleShowTalker: (user: User | null) => void;
	setNewStatementType: (type: StatementType) => void;
	setNewQuestionType: (type: QuestionType) => void;
}

export const StatementProvider: React.FC<StatementProviderProps> = ({
	statement,
	stage,
	topParentStatement,
	talker,
	role,
	newStatementType,
	newQuestionType,
	showNewStatement,
	showUserQuestions,
	userDataQuestions,
	screen,
	isMassConsensus,
	handleShowTalker,
	setNewStatementType,
	setNewQuestionType,
}) => {
	const dispatch = useDispatch();

	const contextValue = useMemo(
		() => ({
			statement,
			stage,
			talker,
			handleShowTalker,
			role,
			setNewStatementType,
			newStatementType,
			setNewQuestionType,
			newQuestionType,
			handleSetNewStatement: () => {
				dispatch(setShowNewStatementModal(true));
			},
		}),
		[
			statement,
			stage,
			talker,
			role,
			handleShowTalker,
			setNewStatementType,
			newStatementType,
			setNewQuestionType,
			newQuestionType,
			dispatch,
		]
	);

	return (
		<StatementContext.Provider value={contextValue}>
			<StatementContent
				statement={statement}
				topParentStatement={topParentStatement}
				showNewStatement={showNewStatement}
				showUserQuestions={showUserQuestions}
				userDataQuestions={userDataQuestions}
				screen={screen}
				isMassConsensus={isMassConsensus}
			/>
		</StatementContext.Provider>
	);
};
