import {
	selectUserDataByStatementId,
	selectUserQuestionsByStatementId,
} from '@/redux/userData/userDataSlice';
import UserDataQuestions from '@/view/pages/statement/components/userDataQuestions/UserDataQuestions';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import {
	getStepNavigation,
	useMassConsensusSteps,
} from '../../MassConsensusVM';

const UserDemographicMC = () => {
	const navigate = useNavigate();
	const { steps, currentStep } = useMassConsensusSteps();
	const { nextStep: goTo } = getStepNavigation(steps, currentStep);
	const { statementId } = useParams();
	const userDataQuestions = useSelector(
		selectUserQuestionsByStatementId(statementId || '')
	);
	const userData = useSelector(
		selectUserDataByStatementId(statementId || '')
	);

	function next() {
		navigate(`/mass-consensus/${statementId}/${goTo}`);
	}

	// Loading state
	if (userDataQuestions === undefined || userData === undefined) {
		return <div>Loading...</div>;
	}

	// If no questions or all answered, show loading while navigating
	if (
		userDataQuestions.length === 0 ||
		userData.length >= userDataQuestions.length
	) {
		return <div>Proceeding to next step...</div>;
	}

	return (
		<UserDataQuestions
			questions={userDataQuestions}
			closeModal={() => next()}
		/>
	);
};
export default UserDemographicMC;
