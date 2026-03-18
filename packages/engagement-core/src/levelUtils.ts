import {
	EngagementLevel,
	LEVEL_THRESHOLDS,
	LEVEL_NAMES,
} from '@freedi/shared-types';

/**
 * Calculate the engagement level for a given total credit count.
 */
export function calculateLevel(totalCredits: number): EngagementLevel {
	if (totalCredits >= LEVEL_THRESHOLDS[EngagementLevel.LEADER]) {
		return EngagementLevel.LEADER;
	}
	if (totalCredits >= LEVEL_THRESHOLDS[EngagementLevel.ADVOCATE]) {
		return EngagementLevel.ADVOCATE;
	}
	if (totalCredits >= LEVEL_THRESHOLDS[EngagementLevel.CONTRIBUTOR]) {
		return EngagementLevel.CONTRIBUTOR;
	}
	if (totalCredits >= LEVEL_THRESHOLDS[EngagementLevel.PARTICIPANT]) {
		return EngagementLevel.PARTICIPANT;
	}

	return EngagementLevel.OBSERVER;
}

/**
 * Get the credit threshold needed for the next level.
 * Returns Infinity if already at max level.
 */
export function getNextLevelThreshold(currentLevel: EngagementLevel): number {
	const nextLevel = currentLevel + 1;
	if (nextLevel > EngagementLevel.LEADER) {
		return Infinity;
	}

	return LEVEL_THRESHOLDS[nextLevel as EngagementLevel];
}

/**
 * Get human-readable name for an engagement level.
 */
export function getLevelName(level: EngagementLevel): string {
	return LEVEL_NAMES[level] ?? 'Unknown';
}

/**
 * Calculate progress percentage toward the next level.
 * Returns 100 if at max level.
 */
export function getLevelProgress(
	totalCredits: number,
	currentLevel: EngagementLevel
): number {
	if (currentLevel >= EngagementLevel.LEADER) {
		return 100;
	}

	const currentThreshold = LEVEL_THRESHOLDS[currentLevel];
	const nextThreshold = getNextLevelThreshold(currentLevel);
	const progress = totalCredits - currentThreshold;
	const range = nextThreshold - currentThreshold;

	if (range <= 0) return 100;

	return Math.min(100, Math.round((progress / range) * 100));
}

/**
 * Check if a user just leveled up by comparing old and new credit totals.
 */
export function didLevelUp(
	oldTotalCredits: number,
	newTotalCredits: number
): boolean {
	return calculateLevel(oldTotalCredits) < calculateLevel(newTotalCredits);
}
