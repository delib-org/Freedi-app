import { useContext } from 'react';
import { StatementContext } from '../../../StatementCont';

import { QuestionType } from '@/types/TypeEnums';
import MassConsensus from './massConsesus/MassConsensus';
import Document from './document/Document';

const QuestionPage = () => {
	const { statement } = useContext(StatementContext);
	const massConsensus: boolean | undefined =
		statement?.questionSettings?.questionType ===
		QuestionType.massConsensus;

	if (massConsensus) return <MassConsensus />;

	return <Document />;
};

export default QuestionPage;
