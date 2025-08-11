import { useContext } from 'react';
import { StatementContext } from '../../../StatementCont';

import { QuestionnaireQuestion, QuestionType } from 'delib-npm';
import MassConsensusAdmin from './massConsesusQuestion/MassConsensusAdmin';
import SimpleQuestion from './simpleQuestion/SimpleQuestion';
import { useLocation } from 'react-router';
import StagePage from '../stage/StagePage';
import { stat } from 'fs';

interface Props {
	question?: QuestionnaireQuestion;
}

const QuestionPage = ({ question }: Props) => {
	const location = useLocation();

	const { statement } = useContext(StatementContext);
	const StatementQuestionType = statement?.questionSettings?.questionType;
	const questionQuestionType = question?.questionType;

	const currentQuestionType = questionQuestionType ?? StatementQuestionType;

	const isMassConsensus = currentQuestionType === QuestionType.massConsensus;
	const isSimpleQuestion = currentQuestionType === QuestionType.simple;

	switch (true) {
		case location.pathname.includes('stage'):
			return <StagePage />;
		case isMassConsensus:
			return <MassConsensusAdmin />;
		case isSimpleQuestion:
			return <SimpleQuestion />;
		default:
			return <SimpleQuestion />;
	}
};

export default QuestionPage;
