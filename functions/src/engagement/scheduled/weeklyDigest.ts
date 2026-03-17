/**
 * Weekly Digest - Phase 3
 *
 * Scheduled function: runs daily at 10:00 UTC
 * Checks per-user day preference.
 * Builds and sends weekly digest notifications.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
} from '@freedi/shared-types';
import type { NotificationQueueItem } from '@freedi/shared-types';
import { buildWeeklyDigest, getWeeklyDigestUsers } from '../notifications/digestAggregator';

const getDb = () => getFirestore();

/**
 * Scheduled function: runs daily at 10:00 UTC.
 * Checks if today is each user's preferred digest day.
 */
export const sendWeeklyDigests = onSchedule(
	{
		schedule: '0 10 * * *', // Daily at 10:00 UTC
		timeZone: 'UTC',
		retryCount: 2,
		memory: '512MiB',
	},
	async (): Promise<void> => {
		const startTime = Date.now();
		const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
			new Date().getDay()
		];
		logger.info(`Starting weekly digest run for ${dayName}`);

		try {
			const result = await processWeeklyDigests();

			const durationMs = Date.now() - startTime;
			logger.info('Weekly digest run complete', {
				...result,
				durationMs,
			});
		} catch (error) {
			logger.error('Weekly digest run failed', { error });
		}
	},
);

/**
 * Process weekly digests.
 * Exported for testing and manual invocation.
 */
export async function processWeeklyDigests(): Promise<{
	usersProcessed: number;
	digestsSent: number;
	errors: number;
}> {
	let usersProcessed = 0;
	let digestsSent = 0;
	let errors = 0;

	try {
		const userIds = await getWeeklyDigestUsers();

		if (userIds.length === 0) {
			logger.info('No users eligible for weekly digest today');

			return { usersProcessed: 0, digestsSent: 0, errors: 0 };
		}

		logger.info(`Processing weekly digests for ${userIds.length} users`);

		for (const userId of userIds) {
			try {
				const digest = await buildWeeklyDigest(userId);
				usersProcessed++;

				if (!digest || digest.items.length === 0) {
					continue;
				}

				const creditsSummary =
					digest.creditsEarned > 0
						? ` You earned ${digest.creditsEarned} credits this week!`
						: '';

				const queueItemId = `weekly_${userId}_${Date.now()}`;
				const notification: NotificationQueueItem = {
					queueItemId,
					userId,
					title: 'Your weekly impact report',
					body: `${digest.items.length} updates, ${digest.totalNewStatements} new discussions.${creditsSummary}`,
					channels: [NotificationChannel.EMAIL],
					sourceApp: SourceApp.MAIN,
					targetPath: '/notifications',
					deliverAt: null,
					frequency: NotificationFrequency.WEEKLY,
					triggerType: NotificationTriggerType.WEEKLY_DIGEST,
					status: NotificationQueueStatus.PENDING,
					createdAt: Date.now(),
				};

				await getDb()
					.collection(Collections.notificationQueue)
					.doc(queueItemId)
					.set(notification);

				digestsSent++;
			} catch (error) {
				logger.error(`Failed to process weekly digest for user ${userId}`, {
					error,
				});
				errors++;
			}
		}
	} catch (error) {
		logger.error('Error in processWeeklyDigests', { error });
		errors++;
	}

	return { usersProcessed, digestsSent, errors };
}
