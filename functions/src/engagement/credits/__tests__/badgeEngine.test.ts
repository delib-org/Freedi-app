import { CreditAction, EngagementLevel, SourceApp } from '@freedi/shared-types';
import type { Badge, UserEngagement } from '@freedi/shared-types';
import { checkAndAwardBadges } from '../badgeEngine';
import { DEFAULT_CREDIT_RULES } from '../defaultCreditRules';

const mockSet = jest.fn().mockResolvedValue(undefined);

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({
		collection: () => ({ doc: () => ({ set: mockSet }) }),
	}),
}));
jest.mock('firebase-functions', () => ({
	logger: { error: jest.fn(), info: jest.fn() },
}));

const STREAK_BADGE_IDS = ['streak_3', 'streak_7', 'streak_30'];

function engagement(overrides: Partial<UserEngagement> = {}): UserEngagement {
	return {
		userId: 'u1',
		totalCredits: 0,
		level: EngagementLevel.OBSERVER,
		badges: [],
		streak: { currentStreak: 30, longestStreak: 30, lastActiveDate: '2026-11-10' },
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	} as UserEngagement;
}

function earnedStreakBadge(badgeId: string): Badge {
	return { badgeId, name: 'old', description: 'old', icon: 'flame', earnedAt: 1 };
}

describe('checkAndAwardBadges', () => {
	beforeEach(() => {
		mockSet.mockClear();
	});

	it('awards no streak badge however long the streak is', async () => {
		const awarded = await checkAndAwardBadges('u1', engagement(), SourceApp.MAIN);

		expect(awarded).toEqual([]);
		expect(mockSet).not.toHaveBeenCalled();
	});

	it('keeps awarding other badges to someone who already holds a streak badge', async () => {
		const awarded = await checkAndAwardBadges(
			'u1',
			engagement({
				badges: STREAK_BADGE_IDS.map(earnedStreakBadge),
				totalEvaluations: 1,
			}),
			SourceApp.MAIN,
		);

		expect(awarded.map((badge) => badge.badgeId)).toEqual(['first_evaluation']);
	});
});

describe('DEFAULT_CREDIT_RULES', () => {
	it.each([CreditAction.DAILY_LOGIN, CreditAction.STREAK_BONUS])('%s is disabled', (action) => {
		expect(DEFAULT_CREDIT_RULES.find((rule) => rule.action === action)?.enabled).toBe(false);
	});
});
