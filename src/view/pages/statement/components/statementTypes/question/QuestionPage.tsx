import { useContext } from 'react';
import MultiStageQuestion from './document/MultiStageQuestion';
import { useLocation } from 'react-router';
import StagePage from '../stage/StagePage';
import { CompoundQuestion } from './compound';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { QuestionType } from '@freedi/shared-types';

const QuestionPage = () => {
	const location = useLocation();
	const { statement } = useContext(StatementContext);

	if (location.pathname.includes('stage')) {
		return <StagePage />;
	}

	if (statement?.questionSettings?.questionType === QuestionType.compound) {
		return <CompoundQuestion />;
	}

	return <MultiStageQuestion />;
};

export default QuestionPage;
