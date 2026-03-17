// Engagement system - Firebase Functions
// Phase 1: Credits, Levels, Badges, Streaks
// Phase 2: Notification Queue, Channel Router, Social Proof

// Credits (Phase 1)
export { awardCredit, getOrCreateUserEngagement } from './credits/creditEngine';
export { getCreditRule, seedDefaultCreditRules, loadCreditRules } from './credits/creditRules';
export { checkAndNotifyLevelUp } from './credits/levelProgression';
export { checkAndAwardBadges } from './credits/badgeEngine';
export {
	trackStatementCreation,
	trackEvaluationEngagement,
	trackVoteEngagement,
	trackDailyLogin,
} from './credits/trackEngagement';
export { DEFAULT_CREDIT_RULES } from './credits/defaultCreditRules';

// Scheduled (Phase 1)
export { calculateStreaks, performStreakCalculation } from './scheduled/streakCalculator';

// Notifications (Phase 2)
export { processQueueItem, processPendingQueueItems } from './notifications/queueProcessor';
export { routeToChannels } from './notifications/channelRouter';
export { checkSocialProofMilestone, checkConsensusShift } from './notifications/socialProofTrigger';

// Digest (Phase 3)
export { buildDailyDigest, buildWeeklyDigest, getDailyDigestUsers, getWeeklyDigestUsers } from './notifications/digestAggregator';
export { sendDailyDigests, processDailyDigests } from './scheduled/dailyDigest';
export { sendWeeklyDigests, processWeeklyDigests } from './scheduled/weeklyDigest';
