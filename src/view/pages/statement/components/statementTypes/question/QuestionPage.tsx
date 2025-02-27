import { useContext } from 'react';
import { StatementContext } from '../../../StatementCont';

import { QuestionType } from '@/types/TypeEnums';
import MassConsensus from './massConsesus/MassConsensus';
import MultiStageQuestion from './document/MultiStageQuestion';
import { useLocation } from 'react-router';
import StagePage from '../stage/StagePage';

const QuestionPage = () => {
	const location = useLocation();

	const { statement } = useContext(StatementContext);
	const massConsensus: boolean | undefined =
		statement?.questionSettings?.questionType ===
		QuestionType.massConsensus;

	if (location.pathname.includes('stage')) {
		return <StagePage />;
	} else if (massConsensus) {
		return <MassConsensus />;
	} else {
		return <MultiStageQuestion />;
	}
};

export default QuestionPage;
