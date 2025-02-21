import { Statement } from '@/types/statement/Statement';
import { QuestionType, StatementType } from '@/types/TypeEnums';
import { User } from '@/types/user/User';
import { Role } from '@/types/user/UserSettings';
import { createContext } from 'react';

interface StatementContextProps {
	statement: Statement | undefined;
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
	newQuestionType: QuestionType.multiStage,
});
