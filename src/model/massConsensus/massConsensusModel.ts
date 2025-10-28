import { MassConsensusPageUrls, MassConsensusStage, MassConsensusStageType } from 'delib-npm';

export const defaultMassConsensusProcess: MassConsensusStage[] = [
    { id: '1', type: MassConsensusStageType.introduction, order: 1, title: 'Introduction', url: MassConsensusPageUrls.introduction, skipable: true },
    { id: '2', type: MassConsensusStageType.userDemographics, order: 2, title: 'User Demographics', url: MassConsensusPageUrls.userDemographics, skipable: true },
    { id: '3', type: MassConsensusStageType.question, order: 3, title: 'Question', url: MassConsensusPageUrls.question, skipable: false },
    { id: '4', type: MassConsensusStageType.randomSuggestions, order: 4, title: 'Random Suggestions', url: MassConsensusPageUrls.randomSuggestions, skipable: false },
    { id: '5', type: MassConsensusStageType.topSuggestions, order: 5, title: 'Top Suggestions', url: MassConsensusPageUrls.topSuggestions, skipable: true },
    { id: '6', type: MassConsensusStageType.mySuggestions, order: 6, title: 'My Suggestions', url: MassConsensusPageUrls.mySuggestions, skipable: true },
    { id: '7', type: MassConsensusStageType.voting, order: 7, title: 'Voting', url: MassConsensusPageUrls.voting, skipable: false },
    { id: '8', type: MassConsensusStageType.results, order: 8, title: 'Results Summary', url: MassConsensusPageUrls.results, skipable: true },
    { id: '9', type: MassConsensusStageType.leaveFeedback, order: 9, title: 'Leave Feedback', url: MassConsensusPageUrls.leaveFeedback, skipable: true },
    { id: '10', type: MassConsensusStageType.thankYou, order: 10, title: 'Thank You', url: MassConsensusPageUrls.thankYou, skipable: true },
];
