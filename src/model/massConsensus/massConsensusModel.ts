import { MassConsensusPageUrls, MassConsensusStep } from 'delib-npm';

// Legacy format for backward compatibility
export const defaultMassConsensusProcessLegacy = [
	MassConsensusPageUrls.introduction,
	MassConsensusPageUrls.userDemographics,
	MassConsensusPageUrls.question,
	MassConsensusPageUrls.randomSuggestions,
	MassConsensusPageUrls.topSuggestions,
	MassConsensusPageUrls.voting,
	MassConsensusPageUrls.leaveFeedback,
	MassConsensusPageUrls.thankYou,
];

// New format with step objects
export const defaultMassConsensusProcess: MassConsensusStep[] = [
	{ screen: MassConsensusPageUrls.introduction, statementId: '' },
	{ screen: MassConsensusPageUrls.userDemographics, statementId: '' },
	{ screen: MassConsensusPageUrls.question, statementId: '' },
	{ screen: MassConsensusPageUrls.randomSuggestions, statementId: '' },
	{ screen: MassConsensusPageUrls.topSuggestions, statementId: '' },
	{ screen: MassConsensusPageUrls.voting, statementId: '' },
	{ screen: MassConsensusPageUrls.leaveFeedback, statementId: '' },
	{ screen: MassConsensusPageUrls.thankYou, statementId: '' },
];

// Helper function to convert legacy format to new format
export function convertLegacyStepsToNew(steps: MassConsensusPageUrls[], statementId: string): MassConsensusStep[] {
	return steps.map(step => ({
		screen: step,
		statementId,
		text: undefined
	}));
}

// Helper to check if steps are in new format
export function isNewStepFormat(steps: unknown[]): steps is MassConsensusStep[] {
	if (!steps || steps.length === 0) return false;
	
	return typeof steps[0] === 'object' && steps[0] !== null && 'screen' in steps[0];
}
