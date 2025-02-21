import { ReactElement } from 'react';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { Statement } from '@/types/statement/Statement';
import { QuestionType, StatementType } from '@/types/TypeEnums';

import DocumentIcon from '@/assets/icons/document.svg?react';
import QuestionIcon from '@/assets/icons/navQuestionsIcon.svg?react';
import GroupIcon from '@/assets/icons/group.svg?react';

interface SubGroupCardReturn {
	Icon: ReactElement;
	backgroundColor: string;
	text: string;
}

const getIconByType = (
	statementType: StatementType,
	questionType?: QuestionType
): ReactElement => {
	switch (statementType) {
		case StatementType.group:
			return <GroupIcon />;
		case StatementType.question:
			return questionType === QuestionType.massConsensus ? (
				<DocumentIcon />
			) : (
				<QuestionIcon />
			);
		default:
			return <DocumentIcon />;
	}
};

export default function useSubGroupCard(
	statement: Statement
): SubGroupCardReturn {
	const { backgroundColor } = useStatementColor({ statement });

	try {
		return {
			Icon: getIconByType(
				statement.statementType as StatementType,
				statement.questionSettings?.questionType
			),
			backgroundColor,
			text: statement.statement,
		};
	} catch (error) {
		console.error('Error in useSubGroupCard:', error);

		return {
			Icon: <DocumentIcon />,
			backgroundColor: 'var(--header-home)',
			text: '',
		};
	}
}
