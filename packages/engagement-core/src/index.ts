// Level utilities
export {
	calculateLevel,
	getNextLevelThreshold,
	getLevelName,
	getLevelProgress,
	didLevelUp,
} from './levelUtils';

// Streak utilities
export {
	formatDateString,
	isStreakAtRisk,
	updateStreakForActivity,
	createInitialStreakData,
} from './streakUtils';

// Permission utilities
export {
	canUserPerformAction,
	getLockedActionMessage,
	isAlmostUnlocked,
} from './permissionUtils';

// Credit utilities
export {
	DAILY_CREDIT_CAP,
	DIMINISHING_FACTOR,
	calculateDiminishingCredits,
	applyDailyCap,
	isCooldownElapsed,
} from './creditUtils';

// Re-export key types for convenience
export {
	EngagementLevel,
	LEVEL_THRESHOLDS,
	LEVEL_NAMES,
	NotificationChannel,
	NotificationFrequency,
	CreditAction,
	SourceApp,
	canPerformAction,
	getRequiredLevel,
} from '@freedi/shared-types';

export type {
	UserEngagement,
	Badge,
	DigestPreferences,
	StreakData,
	CreditTransaction,
	CreditRule,
	BranchPreference,
	NotificationQueueItem,
} from '@freedi/shared-types';
