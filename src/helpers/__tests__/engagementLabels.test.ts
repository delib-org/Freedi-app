import { EngagementLevel } from '@freedi/shared-types';
import { formatCreditsEarned, formatLevelLabel } from '../engagementLabels';

const hebrew: Record<string, string> = {
	'engagement.levelNumber': 'רמה {{level}}',
	'engagement.creditsEarned': '+{{amount}} נקודות',
};
const t = (key: string): string => hebrew[key] ?? key;

describe('engagementLabels', () => {
	it('labels a level by its number', () => {
		expect(formatLevelLabel(t, EngagementLevel.ADVOCATE)).toBe('רמה 3');
	});

	it('labels the first level too', () => {
		expect(formatLevelLabel(t, EngagementLevel.OBSERVER)).toBe('רמה 0');
	});

	it('labels credits earned', () => {
		expect(formatCreditsEarned(t, 3)).toBe('+3 נקודות');
	});
});
