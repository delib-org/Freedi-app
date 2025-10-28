/**
 * Convert support level (-1 to 1) to user-friendly label
 */
export function getSupportLabel(supportLevel: number, t: (key: string) => string): string {
	if (supportLevel > 0.7) return t('Strongly Supports');
	if (supportLevel > 0.3) return t('Supports');
	if (supportLevel > -0.3) return t('Neutral');
	if (supportLevel > -0.7) return t('Challenges');

	return t('Strongly Challenges');
}

/**
 * Get score interpretation text
 */
export function getScoreInterpretation(totalScore: number, t: (key: string) => string): string {
	if (totalScore > 5) return t('Strong evidence supports this idea');
	if (totalScore > 2) return t('Evidence leans toward supporting this idea');
	if (totalScore > -2) return t('Evidence is mixed - discussion ongoing');
	if (totalScore > -5) return t('Evidence is challenging this idea');

	return t('Strong challenges suggest this idea needs rethinking');
}

/**
 * Get support color class
 */
export function getSupportColor(supportLevel: number): 'support' | 'challenge' | 'neutral' {
	if (supportLevel > 0.3) return 'support';
	if (supportLevel < -0.3) return 'challenge';
	
return 'neutral';
}
