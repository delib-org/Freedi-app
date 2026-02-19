import { User, Role, Statement, StatementType, QuestionType } from '@freedi/shared-types';
import { createContext } from 'react';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';

interface StatementContextProps {
	statement: Statement | undefined;
	stage: Statement | undefined;
	talker: User | null;
	handleShowTalker: (talker: User | null) => void;
	handleSetNewStatement: (showPopup?: boolean) => void;
	role: Role | undefined;
	setNewStatementType: (newStatementType: StatementType) => void;
	setNewQuestionType: (newQuestionType: QuestionType) => void;
	newStatementType: StatementType; //used to determine the type of the new statement when created
	newQuestionType: QuestionType; //used to determine the type of the new question when created
}

export const StatementContext = createContext<StatementContextProps>({
	statement: undefined,
	stage: undefined,
	talker: null,
	role: undefined,
	handleSetNewStatement: () => {
		return;
	},
	handleShowTalker: () => {
		return;
	},
	setNewStatementType: () => {
		return;
	},
	setNewQuestionType: () => {
		return;
	},
	newStatementType: StatementType.group,
	newQuestionType: getDefaultQuestionType(),
});
