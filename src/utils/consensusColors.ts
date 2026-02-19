import { logError } from '@/utils/errorHandling';
/**
 * Utility functions for calculating consensus colors based on agreement scores
 */

// CSS variable names for agreement colors from most negative to most positive
const agreementColors = [
	'--range-objections-100', // Strong disagreement (dark red)
	'--range-objections-60', // Moderate disagreement
	'--range-objections-30', // Mild disagreement
	'--range-conflict-100', // Strong conflict (yellow-orange)
	'--range-conflict-60', // Moderate conflict
	'--range-conflict-30', // Mild conflict
	'--range-positive-30', // Mild agreement (light green)
	'--range-positive-60', // Moderate agreement
	'--range-positive-100', // Strong agreement (green)
];

/**
 * Converts an agreement score to a CSS color variable
 * @param agreement - Agreement score between -1 (full disagreement) and 1 (full agreement)
 * @returns CSS variable name for the corresponding color
 */
export function getAgreementColor(agreement: number): string {
	try {
		// Clamp agreement between -1 and 1
		const clampedAgreement = Math.max(-1, Math.min(1, agreement));

		// Convert from [-1, 1] to [0, 1] range
		const adjustedAgreement = (clampedAgreement + 1) / 2;

		// Map to color array index
		const index = Math.floor(adjustedAgreement * agreementColors.length * 0.99);

		return agreementColors[Math.max(0, Math.min(index, agreementColors.length - 1))];
	} catch (error) {
		logError(error, { operation: 'utils.consensusColors.adjustedAgreement', metadata: { message: 'Error calculating agreement color:' } });

		return agreementColors[4]; // Default to neutral color
	}
}

/**
 * Calculates agreement score from evaluation data
 * @param sumPro - Sum of positive evaluations
 * @param sumCon - Sum of negative evaluations
 * @param numberOfEvaluators - Total number of evaluators
 * @returns Agreement score between -1 and 1
 */
export function calculateAgreement(
	sumPro: number = 0,
	sumCon: number = 0,
	numberOfEvaluators: number = 1,
): number {
	if (numberOfEvaluators === 0) return 0;

	return (sumPro - sumCon) / numberOfEvaluators;
}

/**
 * Gets the actual color value from CSS variable
 * @param cssVariable - CSS variable name
 * @returns Actual color value or fallback color
 */
export function getCSSVariableValue(cssVariable: string): string {
	try {
		const value = getComputedStyle(document.documentElement).getPropertyValue(cssVariable).trim();

		return value || getFallbackColor(cssVariable);
	} catch {
		return getFallbackColor(cssVariable);
	}
}

/**
 * Provides fallback colors for CSS variables
 * @param cssVariable - CSS variable name
 * @returns Fallback color value
 */
function getFallbackColor(cssVariable: string): string {
	const fallbacks: Record<string, string> = {
		'--range-objections-100': '#D32F2F', // Dark red
		'--range-objections-60': '#E57373', // Medium red
		'--range-objections-30': '#FFCDD2', // Light red
		'--range-conflict-100': '#FFA000', // Dark orange
		'--range-conflict-60': '#FFB74D', // Medium orange
		'--range-conflict-30': '#FFE0B2', // Light orange
		'--range-positive-30': '#C8E6C9', // Light green
		'--range-positive-60': '#81C784', // Medium green
		'--range-positive-100': '#388E3C', // Dark green
	};

	return fallbacks[cssVariable] || '#9E9E9E'; // Default grey
}
