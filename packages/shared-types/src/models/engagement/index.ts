// Enums
export { NotificationChannel } from './NotificationChannel';
export { NotificationFrequency } from './NotificationFrequency';
export { NotificationTriggerType } from './NotificationTriggerType';
export { SourceApp } from './SourceApp';
export { CreditAction } from './CreditAction';
export { HookPhase, ActionLevel } from './HookModel';

// Notification Queue
export {
	NotificationQueueStatus,
	NotificationQueueItemSchema,
	type NotificationQueueItem,
} from './NotificationQueue';

// Credit Model
export {
	CreditRuleSchema,
	type CreditRule,
	CreditTransactionSchema,
	type CreditTransaction,
} from './CreditModel';

// Engagement Model
export {
	EngagementLevel,
	LEVEL_THRESHOLDS,
	LEVEL_NAMES,
	BadgeSchema,
	type Badge,
	DigestPreferencesSchema,
	type DigestPreferences,
	StreakDataSchema,
	type StreakData,
	UserEngagementSchema,
	type UserEngagement,
	BranchPreferenceSchema,
	type BranchPreference,
} from './EngagementModel';

// Digest Model
export {
	DigestItemSchema,
	type DigestItem,
	DigestContentSchema,
	type DigestContent,
} from './DigestModel';

// Permission Model
export {
	ACTION_LEVEL_REQUIREMENTS,
	canPerformAction,
	getRequiredLevel,
} from './PermissionModel';

// Deep Links
export { APP_DEEP_LINKS, buildDeepLink } from './DeepLinks';
