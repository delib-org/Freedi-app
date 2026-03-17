/**
 * Badge Engine - Phase 1
 *
 * Awards badges based on achievement criteria.
 * Checks badge triggers after each credit award.
 * Triggers BADGE_EARNED notifications.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
} from '@freedi/shared-types';
import type { Badge, UserEngagement, NotificationQueueItem } from '@freedi/shared-types';

/** Badge definition with trigger criteria */
interface BadgeDefinition {
	badgeId: string;
	name: string;
	description: string;
	icon: string;
	/** Returns true if the user qualifies for this badge */
	check: (engagement: UserEngagement) => boolean;
}

/**
 * All badge definitions. Add new badges here.
 * The check function determines when a badge is earned.
 */
const BADGE_DEFINITIONS: BadgeDefinition[] = [
	{
		badgeId: 'first_evaluation',
		name: 'First Voice',
		description: 'Evaluated your first option',
		icon: 'star',
		check: (e) => (e.totalEvaluations ?? 0) >= 1,
	},
	{
		badgeId: 'evaluator_10',
		name: 'Active Evaluator',
		description: 'Evaluated 10 options',
		icon: 'thumbs_up',
		check: (e) => (e.totalEvaluations ?? 0) >= 10,
	},
	{
		badgeId: 'evaluator_50',
		name: 'Expert Evaluator',
		description: 'Evaluated 50 options',
		icon: 'trophy',
		check: (e) => (e.totalEvaluations ?? 0) >= 50,
	},
	{
		badgeId: 'first_option',
		name: 'Idea Maker',
		description: 'Created your first option',
		icon: 'lightbulb',
		check: (e) => (e.totalOptions ?? 0) >= 1,
	},
	{
		badgeId: 'creator_5',
		name: 'Creative Mind',
		description: 'Created 5 options',
		icon: 'palette',
		check: (e) => (e.totalOptions ?? 0) >= 5,
	},
	{
		badgeId: 'streak_3',
		name: '3-Day Streak',
		description: 'Active for 3 days in a row',
		icon: 'flame',
		check: (e) => e.streak.currentStreak >= 3,
	},
	{
		badgeId: 'streak_7',
		name: 'Week Warrior',
		description: 'Active for 7 days in a row',
		icon: 'fire',
		check: (e) => e.streak.currentStreak >= 7,
	},
	{
		badgeId: 'streak_30',
		name: 'Monthly Dedication',
		description: 'Active for 30 days in a row',
		icon: 'medal',
		check: (e) => e.streak.currentStreak >= 30,
	},
	{
		badgeId: 'first_vote',
		name: 'Voter',
		description: 'Cast your first vote',
		icon: 'ballot',
		check: (e) => (e.totalVotes ?? 0) >= 1,
	},
	{
		badgeId: 'commenter_10',
		name: 'Conversationalist',
		description: 'Left 10 comments',
		icon: 'chat',
		check: (e) => (e.totalComments ?? 0) >= 10,
	},
];

/**
 * Check all badge triggers and award any newly earned badges.
 * Returns the list of newly earned badges (empty if none).
 */
export async function checkAndAwardBadges(
	userId: string,
	engagement: UserEngagement,
	sourceApp: SourceApp,
): Promise<Badge[]> {
	const existingBadgeIds = new Set(engagement.badges.map((b) => b.badgeId));
	const newBadges: Badge[] = [];

	for (const definition of BADGE_DEFINITIONS) {
		if (existingBadgeIds.has(definition.badgeId)) {
			continue;
		}

		if (definition.check(engagement)) {
			const badge: Badge = {
				badgeId: definition.badgeId,
				name: definition.name,
				description: definition.description,
				icon: definition.icon,
				earnedAt: Date.now(),
			};
			newBadges.push(badge);
		}
	}

	if (newBadges.length === 0) {
		return [];
	}

	// Enqueue badge notifications (non-blocking)
	const db = getFirestore();
	const notificationPromises = newBadges.map((badge) => {
		const queueItemId = `badge_${userId}_${badge.badgeId}_${Date.now()}`;
		const notification: NotificationQueueItem = {
			queueItemId,
			userId,
			title: 'Badge Earned!',
			body: `You earned the "${badge.name}" badge: ${badge.description}`,
			channels: [NotificationChannel.IN_APP],
			sourceApp,
			targetPath: '/profile',
			deliverAt: null,
			frequency: NotificationFrequency.INSTANT,
			triggerType: NotificationTriggerType.BADGE_EARNED,
			status: NotificationQueueStatus.PENDING,
			createdAt: Date.now(),
		};

		return db
			.collection(Collections.notificationQueue)
			.doc(queueItemId)
			.set(notification)
			.catch((error: unknown) => {
				logger.error('Failed to enqueue badge notification', {
					userId,
					badgeId: badge.badgeId,
					error,
				});
			});
	});

	await Promise.all(notificationPromises);

	logger.info(`Awarded ${newBadges.length} badges to user ${userId}`, {
		badges: newBadges.map((b) => b.badgeId),
	});

	return newBadges;
}
