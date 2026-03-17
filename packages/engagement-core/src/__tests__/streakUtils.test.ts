import {
	formatDateString,
	isStreakAtRisk,
	updateStreakForActivity,
	createInitialStreakData,
} from '../streakUtils';
import type { StreakData } from '@freedi/shared-types';

describe('streakUtils', () => {
	describe('formatDateString', () => {
		it('should format dates as YYYY-MM-DD', () => {
			const date = new Date(2024, 0, 15); // Jan 15, 2024
			expect(formatDateString(date)).toBe('2024-01-15');
		});

		it('should pad single-digit months and days', () => {
			const date = new Date(2024, 2, 5); // Mar 5, 2024
			expect(formatDateString(date)).toBe('2024-03-05');
		});
	});

	describe('isStreakAtRisk', () => {
		it('should return false for today', () => {
			const today = formatDateString(new Date());
			expect(isStreakAtRisk(today)).toBe(false);
		});

		it('should return false for yesterday', () => {
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);
			expect(isStreakAtRisk(formatDateString(yesterday))).toBe(false);
		});

		it('should return true for 2 days ago', () => {
			const twoDaysAgo = new Date();
			twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
			expect(isStreakAtRisk(formatDateString(twoDaysAgo))).toBe(true);
		});
	});

	describe('updateStreakForActivity', () => {
		it('should not change streak when already active today', () => {
			const today = '2024-03-15';
			const streak: StreakData = {
				currentStreak: 5,
				longestStreak: 10,
				lastActiveDate: today,
				streakGraceDayUsed: false,
			};

			const result = updateStreakForActivity(streak, today);
			expect(result.currentStreak).toBe(5);
		});

		it('should increment streak for consecutive day', () => {
			const streak: StreakData = {
				currentStreak: 5,
				longestStreak: 10,
				lastActiveDate: '2024-03-14',
				streakGraceDayUsed: false,
			};

			const result = updateStreakForActivity(streak, '2024-03-15');
			expect(result.currentStreak).toBe(6);
			expect(result.lastActiveDate).toBe('2024-03-15');
		});

		it('should use grace day for 2-day gap', () => {
			const streak: StreakData = {
				currentStreak: 5,
				longestStreak: 10,
				lastActiveDate: '2024-03-13',
				streakGraceDayUsed: false,
			};

			const result = updateStreakForActivity(streak, '2024-03-15');
			expect(result.currentStreak).toBe(6);
			expect(result.streakGraceDayUsed).toBe(true);
		});

		it('should reset streak if grace day already used', () => {
			const streak: StreakData = {
				currentStreak: 5,
				longestStreak: 10,
				lastActiveDate: '2024-03-13',
				streakGraceDayUsed: true,
			};

			const result = updateStreakForActivity(streak, '2024-03-15');
			expect(result.currentStreak).toBe(1);
		});

		it('should reset streak for 3+ day gap', () => {
			const streak: StreakData = {
				currentStreak: 5,
				longestStreak: 10,
				lastActiveDate: '2024-03-12',
				streakGraceDayUsed: false,
			};

			const result = updateStreakForActivity(streak, '2024-03-15');
			expect(result.currentStreak).toBe(1);
		});

		it('should update longest streak when surpassed', () => {
			const streak: StreakData = {
				currentStreak: 10,
				longestStreak: 10,
				lastActiveDate: '2024-03-14',
				streakGraceDayUsed: false,
			};

			const result = updateStreakForActivity(streak, '2024-03-15');
			expect(result.longestStreak).toBe(11);
		});
	});

	describe('createInitialStreakData', () => {
		it('should create streak with currentStreak = 1', () => {
			const result = createInitialStreakData();
			expect(result.currentStreak).toBe(1);
			expect(result.longestStreak).toBe(1);
			expect(result.streakGraceDayUsed).toBe(false);
		});
	});
});
