import { useContext } from 'react';
import { StatementContext } from '../../../StatementCont';

import { QuestionType } from '@/types/TypeEnums';
import MassConsensus from './massConsesus/MassConsensus';
import MultiStageQuestion from './document/MultiStageQuestion';

const QuestionPage = () => {
	const { statement } = useContext(StatementContext);
	const massConsensus: boolean | undefined =
		statement?.questionSettings?.questionType ===
		QuestionType.massConsensus;

	if (massConsensus) return <MassConsensus />;

	return <MultiStageQuestion />;
};

export default QuestionPage;
