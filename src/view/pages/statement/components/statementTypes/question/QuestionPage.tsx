import MultiStageQuestion from './document/MultiStageQuestion';
import { useLocation } from 'react-router';
import StagePage from '../stage/StagePage';

const QuestionPage = () => {
	const location = useLocation();

	if (location.pathname.includes('stage')) {
		return <StagePage />;
	}

	return <MultiStageQuestion />;
};

export default QuestionPage;
