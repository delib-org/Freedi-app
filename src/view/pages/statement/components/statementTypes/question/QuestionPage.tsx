import { useContext } from 'react';
import { StatementContext } from '../../../StatementCont';

import { QuestionType } from 'delib-npm';
import MassConsensusAdmin from './massConsesusQuestion/MassConsensusAdmin';
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
		return <MassConsensusAdmin />;
	} else {
		return <MultiStageQuestion />;
	}
};

export default QuestionPage;
