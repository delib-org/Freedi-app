import { EngagementLevel, CreditAction } from '@freedi/shared-types';
import type { UserEngagement } from '@freedi/shared-types';
import {
	canUserPerformAction,
	getLockedActionMessage,
} from '../permissionUtils';

function createMockEngagement(
	overrides: Partial<UserEngagement> = {}
): UserEngagement {
	return {
		userId: 'test-user',
		totalCredits: 0,
		level: EngagementLevel.OBSERVER,
		badges: [],
		streak: {
			currentStreak: 0,
			longestStreak: 0,
			lastActiveDate: '2024-01-01',
		},
		digestPreferences: {
			dailyDigest: false,
			weeklyDigest: false,
			timezone: 'UTC',
		},
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		...overrides,
	};
}

describe('permissionUtils', () => {
	describe('canUserPerformAction', () => {
		it('should allow read-only actions for null engagement', () => {
			expect(canUserPerformAction(null, 'browse')).toBe(true);
		});

		it('should deny evaluate for null engagement', () => {
			expect(
				canUserPerformAction(null, CreditAction.EVALUATE_OPTION)
			).toBe(false);
		});

		it('should allow evaluate for PARTICIPANT level', () => {
			const engagement = createMockEngagement({
				level: EngagementLevel.PARTICIPANT,
			});
			expect(
				canUserPerformAction(engagement, CreditAction.EVALUATE_OPTION)
			).toBe(true);
		});

		it('should deny create_option for PARTICIPANT level', () => {
			const engagement = createMockEngagement({
				level: EngagementLevel.PARTICIPANT,
			});
			expect(
				canUserPerformAction(engagement, CreditAction.CREATE_OPTION)
			).toBe(false);
		});

		it('should allow create_option for CONTRIBUTOR level', () => {
			const engagement = createMockEngagement({
				level: EngagementLevel.CONTRIBUTOR,
			});
			expect(
				canUserPerformAction(engagement, CreditAction.CREATE_OPTION)
			).toBe(true);
		});

		it('should allow trial mode for Level 1 actions', () => {
			const engagement = createMockEngagement({
				level: EngagementLevel.OBSERVER,
				trialModeActive: true,
				trialModeExpiresAt: Date.now() + 86_400_000, // 24h from now
			});
			expect(
				canUserPerformAction(engagement, CreditAction.EVALUATE_OPTION)
			).toBe(true);
		});

		it('should deny trial mode for Level 2+ actions', () => {
			const engagement = createMockEngagement({
				level: EngagementLevel.OBSERVER,
				trialModeActive: true,
				trialModeExpiresAt: Date.now() + 86_400_000,
			});
			expect(
				canUserPerformAction(engagement, CreditAction.CREATE_OPTION)
			).toBe(false);
		});

		it('should deny trial mode when expired', () => {
			const engagement = createMockEngagement({
				level: EngagementLevel.OBSERVER,
				trialModeActive: true,
				trialModeExpiresAt: Date.now() - 1000, // expired
			});
			expect(
				canUserPerformAction(engagement, CreditAction.EVALUATE_OPTION)
			).toBe(false);
		});
	});

	describe('getLockedActionMessage', () => {
		it('should return message with correct level name', () => {
			const message = getLockedActionMessage(CreditAction.EVALUATE_OPTION);
			expect(message).toContain('Participant');
		});

		it('should return message for create_option', () => {
			const message = getLockedActionMessage(CreditAction.CREATE_OPTION);
			expect(message).toContain('Contributor');
		});
	});
});
