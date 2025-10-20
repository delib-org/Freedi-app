import {
    selectUserDemographicByStatementId,
    selectUserDemographicQuestionsByStatementId,
} from '@/redux/userDemographic/userDemographicSlice';
import UserDemographicQuestions from '@/view/pages/statement/components/userDemographicQuestions/UserDemographicQuestions';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import {
    getStageNavigation,
    useMassConsensusStages,
} from '../../MassConsensusVM';

const UserDemographicMC = () => {
    const navigate = useNavigate();
    const { stages, currentStage } = useMassConsensusStages();
    const { nextStage: goTo } = getStageNavigation(stages, currentStage);
    const { statementId } = useParams();
    const userDemographicQuestions = useSelector(
        selectUserDemographicQuestionsByStatementId(statementId || '')
    );
    const userDemographic = useSelector(
        selectUserDemographicByStatementId(statementId || '')
    );

    function next() {
        navigate(`/mass-consensus/${statementId}/${goTo}`);
    }

    // Loading state
    if (userDemographicQuestions === undefined || userDemographic === undefined) {
        return <div>Loading...</div>;
    }

    // If no questions or all answered, show loading while navigating
    if (
        userDemographicQuestions.length === 0 ||
        userDemographic.length >= userDemographicQuestions.length
    ) {
        return <div>Proceeding to next step...</div>;
    }

    return (
        <UserDemographicQuestions
            questions={userDemographicQuestions}
            closeModal={() => next()}
        />
    );
};
export default UserDemographicMC;
