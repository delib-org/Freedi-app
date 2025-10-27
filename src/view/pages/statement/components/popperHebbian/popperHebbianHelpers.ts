/**
 * Convert support level (-1 to 1) to user-friendly label
 */
export function getSupportLabel(supportLevel: number): string {
	if (supportLevel > 0.7) return 'Strongly Supports';
	if (supportLevel > 0.3) return 'Supports';
	if (supportLevel > -0.3) return 'Neutral';
	if (supportLevel > -0.7) return 'Challenges';
	return 'Strongly Challenges';
}

/**
 * Get score interpretation text
 */
export function getScoreInterpretation(totalScore: number): string {
	if (totalScore > 5) return 'Strong evidence supports this idea';
	if (totalScore > 2) return 'Evidence leans toward supporting this idea';
	if (totalScore > -2) return 'Evidence is mixed - discussion ongoing';
	if (totalScore > -5) return 'Evidence is challenging this idea';
	return 'Strong challenges suggest this idea needs rethinking';
}

/**
 * Get support color class
 */
export function getSupportColor(supportLevel: number): 'support' | 'challenge' | 'neutral' {
	if (supportLevel > 0.3) return 'support';
	if (supportLevel < -0.3) return 'challenge';
	return 'neutral';
}
