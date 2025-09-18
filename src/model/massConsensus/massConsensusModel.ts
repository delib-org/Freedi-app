import { MassConsensusPageUrls, MassConsensusStep } from 'delib-npm';

export const defaultMassConsensusProcess: MassConsensusStep[] = [
	{ screen: MassConsensusPageUrls.introduction, text: "Introduction" },
	{ screen: MassConsensusPageUrls.userDemographics, text: "User Demographics" },
	{ screen: MassConsensusPageUrls.question, text: "Question" },
	{ screen: MassConsensusPageUrls.randomSuggestions, text: "Random Suggestions" },
	{ screen: MassConsensusPageUrls.topSuggestions, text: "Top Suggestions" },
	{ screen: MassConsensusPageUrls.mySuggestions, text: "My Suggestions" },
	{ screen: MassConsensusPageUrls.voting, text: "Voting" },
	{ screen: MassConsensusPageUrls.results, text: "Results Summary" },
	{ screen: MassConsensusPageUrls.leaveFeedback, text: "Leave Feedback" },
	{ screen: MassConsensusPageUrls.thankYou, text: "Thank You" },
];
