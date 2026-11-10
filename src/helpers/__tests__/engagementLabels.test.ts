import { EngagementLevel } from '@freedi/shared-types';
import { formatCreditsEarned, formatLevelLabel, getDisplayLevel } from '../engagementLabels';

const hebrew: Record<string, string> = {
	'engagement.levelNumber': 'רמה {{level}}',
	'engagement.creditsEarned': '+{{amount}} נקודות',
};
const t = (key: string): string => hebrew[key] ?? key;

describe('engagementLabels', () => {
	it.each([
		[EngagementLevel.OBSERVER, 1],
		[EngagementLevel.PARTICIPANT, 2],
		[EngagementLevel.CONTRIBUTOR, 3],
		[EngagementLevel.ADVOCATE, 4],
		[EngagementLevel.LEADER, 5],
	])('shows stored level %i as %i', (stored, shown) => {
		expect(getDisplayLevel(stored)).toBe(shown);
	});

	it('labels a level by the number a person sees', () => {
		expect(formatLevelLabel(t, EngagementLevel.ADVOCATE)).toBe('רמה 4');
	});

	it('never labels a new person as level 0', () => {
		expect(formatLevelLabel(t, EngagementLevel.OBSERVER)).toBe('רמה 1');
	});

	it('labels credits earned', () => {
		expect(formatCreditsEarned(t, 3)).toBe('+3 נקודות');
	});
});
