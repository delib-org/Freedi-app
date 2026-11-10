import type { EngagementLevel } from '@freedi/shared-types';

type Translate = (key: string) => string;

/** "Level 3" / "רמה 3". Levels are shown by number only, never by name. */
export function formatLevelLabel(t: Translate, level: EngagementLevel): string {
	return t('engagement.levelNumber').replace('{{level}}', String(level));
}

/** "+3 credits" / "+3 נקודות" */
export function formatCreditsEarned(t: Translate, amount: number): string {
	return t('engagement.creditsEarned').replace('{{amount}}', String(amount));
}
