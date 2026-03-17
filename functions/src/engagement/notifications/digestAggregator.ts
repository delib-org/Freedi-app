/**
 * Digest Aggregator - Phase 3
 *
 * Builds daily/weekly digest content:
 * - Aggregates activity across subscribed discussions
 * - Groups by discussion/branch
 * - Includes credit summary and streak info
 * - Generates personalized content per user
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	NotificationQueueStatus,
	NotificationTriggerType,
} from '@freedi/shared-types';
import type {
	DigestContent,
	DigestItem,
	UserEngagement,
	NotificationQueueItem,
} from '@freedi/shared-types';

const db = getFirestore();

/**
 * Build daily digest content for a user.
 * Aggregates notifications from the last 24 hours.
 */
export async function buildDailyDigest(userId: string): Promise<DigestContent | null> {
	const now = Date.now();
	const periodStart = now - 24 * 60 * 60 * 1000; // 24h ago

	return buildDigestForPeriod(userId, periodStart, now);
}

/**
 * Build weekly digest content for a user.
 * Aggregates notifications from the last 7 days.
 */
export async function buildWeeklyDigest(userId: string): Promise<DigestContent | null> {
	const now = Date.now();
	const periodStart = now - 7 * 24 * 60 * 60 * 1000; // 7 days ago

	return buildDigestForPeriod(userId, periodStart, now);
}

/**
 * Build digest content for a specific time period.
 */
async function buildDigestForPeriod(
	userId: string,
	periodStart: number,
	periodEnd: number,
): Promise<DigestContent | null> {
	try {
		// Get sent notifications for this user in the period
		const notificationsSnapshot = await db
			.collection(Collections.notificationQueue)
			.where('userId', '==', userId)
			.where('status', '==', NotificationQueueStatus.SENT)
			.where('createdAt', '>=', periodStart)
			.where('createdAt', '<=', periodEnd)
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		if (notificationsSnapshot.empty) {
			return null;
		}

		const items: DigestItem[] = [];
		let totalNewStatements = 0;
		let totalNewEvaluations = 0;

		for (const doc of notificationsSnapshot.docs) {
			const notification = doc.data() as NotificationQueueItem;

			items.push({
				triggerType: notification.triggerType,
				sourceApp: notification.sourceApp,
				title: notification.title,
				body: notification.body,
				targetPath: notification.targetPath,
				statementId: notification.statementId,
				createdAt: notification.createdAt,
			});

			if (notification.triggerType === NotificationTriggerType.STATEMENT_REPLY) {
				totalNewStatements++;
			}
			if (notification.triggerType === NotificationTriggerType.SOCIAL_PROOF) {
				totalNewEvaluations++;
			}
		}

		// Get credits earned in the period
		const creditsSnapshot = await db
			.collection(Collections.creditLedger)
			.where('userId', '==', userId)
			.where('createdAt', '>=', periodStart)
			.where('createdAt', '<=', periodEnd)
			.get();

		let creditsEarned = 0;
		creditsSnapshot.forEach((doc) => {
			creditsEarned += (doc.data().amount as number) || 0;
		});

		return {
			userId,
			items,
			periodStart,
			periodEnd,
			totalNewStatements,
			totalNewEvaluations,
			creditsEarned,
			createdAt: Date.now(),
		};
	} catch (error) {
		logger.error('Error building digest', { userId, error });

		return null;
	}
}

/**
 * Get users who have opted in to daily digests.
 * Returns batches of user IDs grouped by timezone.
 */
export async function getDailyDigestUsers(targetHour: number): Promise<string[]> {
	try {
		const snapshot = await db
			.collection(Collections.userEngagement)
			.where('digestPreferences.dailyDigest', '==', true)
			.limit(500)
			.get();

		const eligibleUsers: string[] = [];

		for (const doc of snapshot.docs) {
			const engagement = doc.data() as UserEngagement;
			const timezone = engagement.digestPreferences?.timezone || 'UTC';
			const preferredHour = engagement.digestPreferences?.preferredHour ?? 9; // default 9am

			// Check if it's the right hour in the user's timezone
			const userHour = getHourInTimezone(timezone);
			if (userHour === preferredHour || userHour === targetHour) {
				eligibleUsers.push(doc.id);
			}
		}

		return eligibleUsers;
	} catch (error) {
		logger.error('Error getting daily digest users', { error });

		return [];
	}
}

/**
 * Get users who have opted in to weekly digests and it's their preferred day.
 */
export async function getWeeklyDigestUsers(): Promise<string[]> {
	try {
		const snapshot = await db
			.collection(Collections.userEngagement)
			.where('digestPreferences.weeklyDigest', '==', true)
			.limit(500)
			.get();

		const today = new Date().getDay(); // 0=Sunday, 6=Saturday
		const eligibleUsers: string[] = [];

		for (const doc of snapshot.docs) {
			const engagement = doc.data() as UserEngagement;
			const preferredDay = engagement.digestPreferences?.preferredDay ?? 1; // default Monday

			if (today === preferredDay) {
				eligibleUsers.push(doc.id);
			}
		}

		return eligibleUsers;
	} catch (error) {
		logger.error('Error getting weekly digest users', { error });

		return [];
	}
}

/**
 * Get current hour in a specific timezone.
 */
function getHourInTimezone(timezone: string): number {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			hour: 'numeric',
			hour12: false,
		});
		const parts = formatter.formatToParts(new Date());
		const hourPart = parts.find((p) => p.type === 'hour');

		return parseInt(hourPart?.value ?? '0', 10);
	} catch {
		// Invalid timezone, fall back to UTC
		return new Date().getUTCHours();
	}
}
