/**
 * Convert corroboration score (0-1) to user-friendly label
 * 0 = falsifies, 0.5 = neutral, 1 = corroborates
 */
export function getCorroborationLabel(
	corroborationScore: number,
	t: (key: string) => string,
): string {
	if (corroborationScore >= 0.8) return t('Strongly Corroborates');
	if (corroborationScore >= 0.6) return t('Corroborates');
	if (corroborationScore >= 0.4) return t('Neutral');
	if (corroborationScore >= 0.2) return t('Challenges');

	return t('Strongly Challenges');
}

/**
 * DEPRECATED: Convert support level (-1 to 1) to user-friendly label
 * Use getCorroborationLabel instead
 */
export function getSupportLabel(supportLevel: number, t: (key: string) => string): string {
	// Convert old -1 to 1 scale to new 0 to 1 scale
	const corroborationScore = (supportLevel + 1) / 2;

	return getCorroborationLabel(corroborationScore, t);
}

/**
 * Get score interpretation text for Hebbian score (0-1)
 */
export function getScoreInterpretation(hebbianScore: number, t: (key: string) => string): string {
	if (hebbianScore >= 0.8) return t('Strong evidence supports this idea');
	if (hebbianScore >= 0.6) return t('Evidence supports this idea');
	if (hebbianScore >= 0.4) return t('Evidence is mixed - discussion ongoing');
	if (hebbianScore >= 0.2) return t('Evidence challenges this idea');

	return t('Strong challenges suggest this idea needs rethinking');
}

/**
 * Get corroboration color class based on 0-1 score
 */
export function getCorroborationColor(
	corroborationScore: number,
): 'support' | 'challenge' | 'neutral' {
	if (corroborationScore >= 0.6) return 'support';
	if (corroborationScore <= 0.4) return 'challenge';

	return 'neutral';
}

/**
 * DEPRECATED: Get support color class
 * Use getCorroborationColor instead
 */
export function getSupportColor(supportLevel: number): 'support' | 'challenge' | 'neutral' {
	// Convert old -1 to 1 scale to new 0 to 1 scale
	const corroborationScore = (supportLevel + 1) / 2;

	return getCorroborationColor(corroborationScore);
}
