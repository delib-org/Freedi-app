import { logError } from '@/utils/errorHandling';
// LocalStorage keys
const EXPLANATIONS_KEY_PREFIX = 'mc_explanations_';
const GLOBAL_PREFS_KEY = 'mc_global_preferences';

export interface ExplanationPreferences {
	seenExplanations: {
		[statementId: string]: {
			[stageId: string]: boolean;
		};
	};
	dontShowAgain: {
		[statementId: string]: boolean;
	};
	globalDontShow: boolean;
	preferredDisplayMode?: 'card' | 'tooltip' | 'modal' | 'inline' | 'toast';
}

// Get all preferences
export function getExplanationPreferences(): ExplanationPreferences {
	try {
		const stored = localStorage.getItem(GLOBAL_PREFS_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		logError(error, { operation: 'localStorage.explanationPreferences.getExplanationPreferences', metadata: { message: 'Error loading explanation preferences:' } });
	}

	return {
		seenExplanations: {},
		dontShowAgain: {},
		globalDontShow: false,
	};
}

// Save preferences
export function saveExplanationPreferences(prefs: ExplanationPreferences): void {
	try {
		localStorage.setItem(GLOBAL_PREFS_KEY, JSON.stringify(prefs));
	} catch (error) {
		logError(error, { operation: 'localStorage.explanationPreferences.saveExplanationPreferences', metadata: { message: 'Error saving explanation preferences:' } });
	}
}

// Check if user has seen an explanation
export function hasSeenExplanation(statementId: string, stageId: string): boolean {
	const prefs = getExplanationPreferences();

	return prefs.seenExplanations[statementId]?.[stageId] || false;
}

// Mark explanation as seen
export function markExplanationSeen(statementId: string, stageId: string): void {
	const prefs = getExplanationPreferences();

	if (!prefs.seenExplanations[statementId]) {
		prefs.seenExplanations[statementId] = {};
	}

	prefs.seenExplanations[statementId][stageId] = true;
	saveExplanationPreferences(prefs);
}

// Set don't show again for a statement
export function setDontShowAgainForStatement(statementId: string, value: boolean): void {
	const prefs = getExplanationPreferences();
	prefs.dontShowAgain[statementId] = value;
	saveExplanationPreferences(prefs);
}

// Get don't show again for a statement
export function getDontShowAgainForStatement(statementId: string): boolean {
	const prefs = getExplanationPreferences();

	return prefs.dontShowAgain[statementId] || prefs.globalDontShow || false;
}

// Set global don't show
export function setGlobalDontShow(value: boolean): void {
	const prefs = getExplanationPreferences();
	prefs.globalDontShow = value;
	saveExplanationPreferences(prefs);
}

// Reset all preferences
export function resetExplanationPreferences(): void {
	localStorage.removeItem(GLOBAL_PREFS_KEY);

	// Also clean up any old statement-specific keys
	const keys = Object.keys(localStorage);
	keys.forEach((key) => {
		if (key.startsWith(EXPLANATIONS_KEY_PREFIX)) {
			localStorage.removeItem(key);
		}
	});
}

// Get user's experience level based on how many explanations they've seen
export function getUserExperienceLevel(statementId: string): 'new' | 'returning' | 'power' {
	const prefs = getExplanationPreferences();
	const seenCount = Object.keys(prefs.seenExplanations[statementId] || {}).length;

	if (seenCount === 0) return 'new';
	if (seenCount < 5) return 'returning';

	return 'power';
}

// Set preferred display mode
export function setPreferredDisplayMode(
	mode: 'card' | 'tooltip' | 'modal' | 'inline' | 'toast',
): void {
	const prefs = getExplanationPreferences();
	prefs.preferredDisplayMode = mode;
	saveExplanationPreferences(prefs);
}

// Get preferred display mode
export function getPreferredDisplayMode():
	| 'card'
	| 'tooltip'
	| 'modal'
	| 'inline'
	| 'toast'
	| undefined {
	const prefs = getExplanationPreferences();

	return prefs.preferredDisplayMode;
}
