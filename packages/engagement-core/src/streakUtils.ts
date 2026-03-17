import type { StreakData } from '@freedi/shared-types';

/**
 * Format a Date to YYYY-MM-DD string.
 */
export function formatDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

/**
 * Get the difference in calendar days between two date strings.
 */
function daysBetween(dateA: string, dateB: string): number {
	const a = new Date(dateA);
	const b = new Date(dateB);
	const diffMs = Math.abs(a.getTime() - b.getTime());

	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if a streak is at risk (user hasn't been active today or yesterday).
 * Only meaningful if the user has a streak > 0.
 */
export function isStreakAtRisk(lastActiveDate: string): boolean {
	const today = formatDateString(new Date());
	const diff = daysBetween(today, lastActiveDate);

	return diff >= 2;
}

/**
 * Calculate updated streak data when a user is active.
 * Implements grace day: missing 1 day reduces bonus to 50% but doesn't reset.
 */
export function updateStreakForActivity(
	currentStreak: StreakData,
	today: string
): StreakData {
	if (currentStreak.lastActiveDate === today) {
		// Already active today, no change
		return currentStreak;
	}

	const daysSinceLastActive = daysBetween(today, currentStreak.lastActiveDate);

	if (daysSinceLastActive === 1) {
		// Consecutive day
		const newStreak = currentStreak.currentStreak + 1;

		return {
			currentStreak: newStreak,
			longestStreak: Math.max(newStreak, currentStreak.longestStreak),
			lastActiveDate: today,
			streakGraceDayUsed: false,
		};
	}

	if (daysSinceLastActive === 2 && !currentStreak.streakGraceDayUsed) {
		// Grace day - streak continues but grace used
		const newStreak = currentStreak.currentStreak + 1;

		return {
			currentStreak: newStreak,
			longestStreak: Math.max(newStreak, currentStreak.longestStreak),
			lastActiveDate: today,
			streakGraceDayUsed: true,
		};
	}

	// Streak broken - reset to 1
	return {
		currentStreak: 1,
		longestStreak: Math.max(1, currentStreak.longestStreak),
		lastActiveDate: today,
		streakGraceDayUsed: false,
	};
}

/**
 * Create initial streak data for a new user.
 */
export function createInitialStreakData(): StreakData {
	return {
		currentStreak: 1,
		longestStreak: 1,
		lastActiveDate: formatDateString(new Date()),
		streakGraceDayUsed: false,
	};
}
