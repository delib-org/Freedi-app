import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { massConsensusStagesSelector } from '@/redux/massConsensus/massConsensusSlice';
import {
    selectUserDemographicByStatementId,
    selectUserDemographicQuestionsByStatementId,
} from '@/redux/userDemographic/userDemographicSlice';
import { MassConsensusPageUrls, MassConsensusStage } from 'delib-npm';
import { useSelector } from 'react-redux';
import { useLocation, useParams } from 'react-router';

interface Props {
    stages: MassConsensusStage[];
    currentStage: MassConsensusPageUrls;
}

export function useMassConsensusStages(): Props {
    const { statementId } = useParams<{ statementId: string }>();
    const location = useLocation();
    const { user } = useAuthentication();

    if (!statementId) {
        throw new Error("Statement ID is missing in URL parameters.");
    }

    let stages = useSelector(massConsensusStagesSelector(statementId));
    const pathSegments = location.pathname.split('/');
    const userDemographicQuestions = useSelector(
        selectUserDemographicQuestionsByStatementId(statementId)
    );
    const userDemographic = useSelector(
        selectUserDemographicByStatementId(statementId)
    );

    const shouldShowUserDemographics =
        userDemographicQuestions.length > 0 &&
        userDemographic.length < userDemographicQuestions.length;

    if (!shouldShowUserDemographics) {
        stages = stages.filter(
            (stage) => stage.url !== MassConsensusPageUrls.userDemographics
        );
    }

    const currentPage = pathSegments.find((segment) => {
        return Object.values(MassConsensusPageUrls).includes(
            segment as MassConsensusPageUrls
        );
    });

    const currentStage =
        (currentPage as MassConsensusPageUrls) ||
        MassConsensusPageUrls.introduction;

    try {
        return { stages, currentStage };
    } catch (error) {
        console.error('Error in useMassConsensusStages:', error);

        return {
            stages: [],
            currentStage: MassConsensusPageUrls.introduction,
        };
    }
}

export function getStageNavigation(
    stages: MassConsensusStage[],
    currentStage: MassConsensusPageUrls = MassConsensusPageUrls.introduction
): {
    nextStage: MassConsensusPageUrls | undefined;
    previousStage: MassConsensusPageUrls | undefined;
    currentStage: MassConsensusPageUrls;
} {
    const currentStageIndex = getCurrentStageIndex(stages, currentStage);

    const nextStageIndex =
        currentStageIndex + 1 >= stages.length ? undefined : currentStageIndex + 1;
    const previousStageIndex =
        currentStageIndex === 0 ? undefined : currentStageIndex - 1;

    const nextStage =
        nextStageIndex !== undefined
            ? stages[nextStageIndex]?.url as MassConsensusPageUrls
            : undefined;
    const previousStage =
        previousStageIndex !== undefined
            ? stages[previousStageIndex]?.url as MassConsensusPageUrls
            : undefined;
    const resolvedCurrentStage =
        (stages[currentStageIndex]?.url || MassConsensusPageUrls.introduction) as MassConsensusPageUrls;

    return { nextStage, previousStage, currentStage: resolvedCurrentStage };
}

function getCurrentStageIndex(
    stages: MassConsensusStage[],
    currentStage: MassConsensusPageUrls
): number {
    if (!stages) return -1;
    const currentStageIndex = stages.findIndex((stage) => stage.url === currentStage);

    return currentStageIndex;
}
