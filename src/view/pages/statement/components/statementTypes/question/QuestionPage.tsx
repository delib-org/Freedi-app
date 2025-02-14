import { useContext } from 'react';
import { StatementContext } from '../../../StatementCont';

import SimpleQuestion from './simpleQuestion/SimpleQuestion';
import { QuestionType } from '@/types/TypeEnums';
import MassConsensus from './massConsesus/MassConsensus';

const QuestionPage = () => {
	const { statement } = useContext(StatementContext);
	const massConsensus: boolean | undefined =
		statement?.questionSettings?.questionType ===
		QuestionType.massConsensus;

	if (massConsensus) return <MassConsensus />;

	return <SimpleQuestion />;
};

export default QuestionPage;
