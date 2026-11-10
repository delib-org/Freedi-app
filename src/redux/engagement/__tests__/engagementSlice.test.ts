import type { Badge, UserEngagement } from '@freedi/shared-types';
import { userBadgesSelector } from '../engagementSlice';

function badge(badgeId: string): Badge {
	return { badgeId, name: badgeId, description: badgeId, icon: 'star', earnedAt: 1 };
}

function stateWith(badges: Badge[] | undefined) {
	const userEngagement = { badges } as UserEngagement;

	return {
		engagement: { userEngagement, recentCredits: [], loading: false, error: null },
	};
}

describe('userBadgesSelector', () => {
	it('hides retired streak badges that were already earned', () => {
		const state = stateWith([badge('streak_3'), badge('first_vote'), badge('streak_30')]);

		expect(userBadgesSelector(state).map((item) => item.badgeId)).toEqual(['first_vote']);
	});

	it('returns an empty list for someone whose only badge is retired', () => {
		expect(userBadgesSelector(stateWith([badge('streak_7')]))).toEqual([]);
	});

	it('returns an empty list when no engagement document is loaded', () => {
		const state = {
			engagement: { userEngagement: null, recentCredits: [], loading: true, error: null },
		};

		expect(userBadgesSelector(state)).toEqual([]);
	});
});
