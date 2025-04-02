import { useAuthentication } from "@/controllers/hooks/useAuthentication";
import { massConsensusStepsSelector } from "@/redux/massConsensus/massConsensusSlice";
import { LoginType, MassConsensusPageUrls } from "delib-npm";
import { useSelector } from "react-redux";
import { useLocation, useParams } from "react-router";

interface Props {
	steps: MassConsensusPageUrls[];
	loginType: LoginType,
	currentStep: MassConsensusPageUrls;
}

export function useMassConsensusSteps(): Props {
	const { statementId } = useParams();
	const location = useLocation();
	const { user } = useAuthentication()
	const loginType = user?.isAnonymous ? LoginType.anonymous : LoginType.google;
	const steps = useSelector(massConsensusStepsSelector(statementId, loginType))
	const pathSegments = location.pathname.split('/');
	const currentPage = pathSegments.find((segment) => {
		return Object.values(MassConsensusPageUrls).includes(segment as MassConsensusPageUrls);
	});
	const currentStep = currentPage as MassConsensusPageUrls || MassConsensusPageUrls.introduction;

	try {
		return { steps, loginType, currentStep };
	} catch (error) {
		console.error("Error in useMassConsensusSteps:", error);

		return { steps: [], loginType: LoginType.anonymous, currentStep: MassConsensusPageUrls.introduction };
	}
}

export function getStepNavigation(steps: MassConsensusPageUrls[], currentStep: MassConsensusPageUrls = MassConsensusPageUrls.introduction): { nextStep: MassConsensusPageUrls | undefined; previousStep: MassConsensusPageUrls | undefined, currentStep: MassConsensusPageUrls } {
	const currentStepIndex = getCurrentStepIndex(steps, currentStep);

	const nextStepIndex = currentStepIndex + 1 >= steps.length ? undefined : currentStepIndex + 1;
	let previousStepIndex = currentStepIndex === 0 ? undefined : currentStepIndex - 1;

	const isPrevSimilarSuggestions = steps[previousStepIndex] === MassConsensusPageUrls.similarSuggestions;

	if (isPrevSimilarSuggestions) {
		previousStepIndex = previousStepIndex - 1;

		if (previousStepIndex < 0) {
			previousStepIndex = undefined;
		}
	}

	const nextStep = nextStepIndex !== undefined ? steps[nextStepIndex] || MassConsensusPageUrls.introduction : undefined;
	const previousStep = previousStepIndex !== undefined ? steps[previousStepIndex] || MassConsensusPageUrls.introduction : undefined;
	const resolvedCurrentStep = steps[currentStepIndex] || MassConsensusPageUrls.introduction;

	return { nextStep, previousStep, currentStep: resolvedCurrentStep };
}

function getCurrentStepIndex(steps: MassConsensusPageUrls[], currentStep): number {
	if (!steps) return -1;
	const currentStepIndex = steps.findIndex((step) => step === currentStep);

	return currentStepIndex;
}
