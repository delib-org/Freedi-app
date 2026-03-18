import {
	type InferOutput,
	array,
	boolean,
	enum_,
	number,
	object,
	optional,
	string,
} from 'valibot';
import { NotificationFrequency } from './NotificationFrequency';

export enum EngagementLevel {
	OBSERVER = 0,
	PARTICIPANT = 1,
	CONTRIBUTOR = 2,
	ADVOCATE = 3,
	LEADER = 4,
}

export const LEVEL_THRESHOLDS: Record<EngagementLevel, number> = {
	[EngagementLevel.OBSERVER]: 0,
	[EngagementLevel.PARTICIPANT]: 50,
	[EngagementLevel.CONTRIBUTOR]: 200,
	[EngagementLevel.ADVOCATE]: 500,
	[EngagementLevel.LEADER]: 1500,
};

export const LEVEL_NAMES: Record<EngagementLevel, string> = {
	[EngagementLevel.OBSERVER]: 'Observer',
	[EngagementLevel.PARTICIPANT]: 'Participant',
	[EngagementLevel.CONTRIBUTOR]: 'Contributor',
	[EngagementLevel.ADVOCATE]: 'Advocate',
	[EngagementLevel.LEADER]: 'Leader',
};

export const BadgeSchema = object({
	badgeId: string(),
	name: string(),
	description: string(),
	icon: string(),
	earnedAt: number(),
});

export type Badge = InferOutput<typeof BadgeSchema>;

export const DigestPreferencesSchema = object({
	dailyDigest: boolean(),
	weeklyDigest: boolean(),
	timezone: string(),
	preferredDay: optional(number()), // 0=Sunday, 6=Saturday
	preferredHour: optional(number()), // 0-23
});

export type DigestPreferences = InferOutput<typeof DigestPreferencesSchema>;

export const StreakDataSchema = object({
	currentStreak: number(),
	longestStreak: number(),
	lastActiveDate: string(), // YYYY-MM-DD format
	streakGraceDayUsed: optional(boolean()),
});

export type StreakData = InferOutput<typeof StreakDataSchema>;

export const UserEngagementSchema = object({
	userId: string(),
	totalCredits: number(),
	level: enum_(EngagementLevel),
	badges: array(BadgeSchema),
	streak: StreakDataSchema,
	digestPreferences: DigestPreferencesSchema,

	// Trial mode for new users
	trialModeExpiresAt: optional(number()),
	trialModeActive: optional(boolean()),

	// Stats
	totalEvaluations: optional(number()),
	totalOptions: optional(number()),
	totalComments: optional(number()),
	totalVotes: optional(number()),

	// Daily tracking
	dailyCreditsEarned: optional(number()),
	dailyCreditResetDate: optional(string()), // YYYY-MM-DD

	createdAt: number(),
	lastUpdate: number(),
});

export type UserEngagement = InferOutput<typeof UserEngagementSchema>;

export const BranchPreferenceSchema = object({
	frequency: enum_(NotificationFrequency),
	lastNotifiedAt: number(),
});

export type BranchPreference = InferOutput<typeof BranchPreferenceSchema>;
