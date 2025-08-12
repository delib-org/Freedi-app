import { MassConsensusPageUrls, MassConsensusStep, MassConsensusProcess, LoginType } from 'delib-npm';

/**
 * Migrates legacy mass consensus process data to the new format
 * Converts steps from array of enum strings to array of step objects
 */
export function migrateMassConsensusProcess(
	process: any,
	statementId: string
): MassConsensusProcess {
	if (!process || !process.loginTypes) {
		throw new Error('Invalid process data');
	}

	const migratedLoginTypes: Record<string, any> = {};

	for (const [loginType, config] of Object.entries(process.loginTypes)) {
		const loginTypeConfig = config as any;
		
		if (!loginTypeConfig.steps) {
			migratedLoginTypes[loginType] = loginTypeConfig;
			continue;
		}

		// Check if already in new format
		if (loginTypeConfig.steps.length > 0 && typeof loginTypeConfig.steps[0] === 'object' && 'screen' in loginTypeConfig.steps[0]) {
			// Already migrated, just ensure statementId is set
			migratedLoginTypes[loginType] = {
				...loginTypeConfig,
				steps: loginTypeConfig.steps.map((step: MassConsensusStep) => ({
					...step,
					statementId: step.statementId || statementId
				}))
			};
		} else {
			// Legacy format - convert to new format
			migratedLoginTypes[loginType] = {
				...loginTypeConfig,
				steps: loginTypeConfig.steps.map((step: MassConsensusPageUrls) => ({
					screen: step,
					statementId,
					text: undefined
				}))
			};
		}
	}

	return {
		statementId: process.statementId || statementId,
		loginTypes: migratedLoginTypes as Record<LoginType, {
			steps: MassConsensusStep[];
			processName?: string;
			currentStep?: number;
		}>
	};
}

/**
 * Checks if a process needs migration
 */
export function needsMigration(process: any): boolean {
	if (!process || !process.loginTypes) {
		return false;
	}

	for (const config of Object.values(process.loginTypes)) {
		const loginTypeConfig = config as any;
		if (loginTypeConfig.steps && loginTypeConfig.steps.length > 0) {
			// Check if any steps are in legacy format (strings)
			if (typeof loginTypeConfig.steps[0] === 'string') {
				return true;
			}
		}
	}

	return false;
}