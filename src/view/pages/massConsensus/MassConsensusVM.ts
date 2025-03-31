import { MassConsensusPageUrls } from "delib-npm";

export function getStep(statementId: string) {
	const currentStep = sessionStorage.getItem(`${statementId}-currentStep`);
	if (currentStep) {
		return parseInt(currentStep, 10);
	}

	sessionStorage.setItem(`${statementId}-currentStep`, '0');

	return 0;
}

export function setStep(statementId: string, step: number) {
	sessionStorage.setItem(`${statementId}-currentStep`, step.toString());
}

export function nextStep(statementId: string, steps: MassConsensusPageUrls[]) {
	const currentStep = getStep(statementId);

	if (currentStep >= steps.length - 1) {
		return steps[currentStep];
	}
	// Increment the step and save it to session storage
	setStep(statementId, currentStep + 1);

	return steps[currentStep + 1];
}

export function previousStep(statementId: string, steps: MassConsensusPageUrls[]) {
	const currentStep = getStep(statementId);

	if (currentStep <= 0) {
		return steps[0];
	}
	// Decrement the step and save it to session storage
	setStep(statementId, currentStep - 1);

	return steps[currentStep - 1];
}