import type { EngagementLevel } from '@freedi/shared-types';

type Translate = (key: string) => string;

/** Stored levels start at 0; people count from 1. */
const DISPLAY_LEVEL_OFFSET = 1;

/** The level number a person sees, 1 to 5, for a stored level of 0 to 4. */
export function getDisplayLevel(level: EngagementLevel): number {
	return level + DISPLAY_LEVEL_OFFSET;
}

/** "Level 3" / "רמה 3". Levels are shown by number only, never by name. */
export function formatLevelLabel(t: Translate, level: EngagementLevel): string {
	return t('engagement.levelNumber').replace('{{level}}', String(getDisplayLevel(level)));
}

/** "+3 credits" / "+3 נקודות" */
export function formatCreditsEarned(t: Translate, amount: number): string {
	return t('engagement.creditsEarned').replace('{{amount}}', String(amount));
}
