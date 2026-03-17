import {
	canPerformAction,
	getRequiredLevel,
	EngagementLevel,
	LEVEL_NAMES,
	LEVEL_THRESHOLDS,
	type UserEngagement,
} from '@freedi/shared-types';

/**
 * Check if a user can perform an action, considering trial mode.
 * Trial mode allows Level 1 actions for 24h without earning credits.
 */
export function canUserPerformAction(
	engagement: UserEngagement | null,
	action: string
): boolean {
	if (!engagement) {
		// No engagement data = Level 0 (Observer)
		return canPerformAction(EngagementLevel.OBSERVER, action);
	}

	// Check trial mode
	if (engagement.trialModeActive && engagement.trialModeExpiresAt) {
		const now = Date.now();
		if (now < engagement.trialModeExpiresAt) {
			// In trial mode: allow up to Level 1 actions
			const requiredLevel = getRequiredLevel(action);
			if (requiredLevel <= EngagementLevel.PARTICIPANT) {
				return true;
			}
		}
	}

	return canPerformAction(engagement.level, action);
}

/**
 * Get a user-friendly message explaining why an action is locked.
 */
export function getLockedActionMessage(action: string): string {
	const requiredLevel = getRequiredLevel(action);
	const levelName = LEVEL_NAMES[requiredLevel] ?? 'Unknown';

	return `Reach ${levelName} level to unlock this action`;
}

/**
 * Check if a user is close to unlocking a level (within 80% progress).
 */
export function isAlmostUnlocked(
	engagement: UserEngagement | null,
	action: string
): boolean {
	if (!engagement) return false;

	const requiredLevel = getRequiredLevel(action);
	if (engagement.level >= requiredLevel) return true;

	// Only check if they're one level away
	if (requiredLevel - engagement.level > 1) return false;

	const threshold = LEVEL_THRESHOLDS[requiredLevel];
	const progress = engagement.totalCredits / threshold;

	return progress >= 0.8;
}
