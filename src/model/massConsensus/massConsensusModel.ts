import { MassConsensusPageUrls, MassConsensusStep } from 'delib-npm';

export const defaultMassConsensusProcess: MassConsensusStep[] = [
	{ screen: MassConsensusPageUrls.introduction },
	{ screen: MassConsensusPageUrls.userDemographics },
	{ screen: MassConsensusPageUrls.question },
	{ screen: MassConsensusPageUrls.randomSuggestions },
	{ screen: MassConsensusPageUrls.topSuggestions },
	{ screen: MassConsensusPageUrls.voting },
	{ screen: MassConsensusPageUrls.leaveFeedback },
	{ screen: MassConsensusPageUrls.thankYou },
];
