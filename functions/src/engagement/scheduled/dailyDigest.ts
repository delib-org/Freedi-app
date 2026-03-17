/**
 * Daily Digest - Phase 3
 *
 * Scheduled function: runs every hour at :00
 * Checks per-user timezone preferences.
 * Builds and sends daily digest notifications.
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
import { buildDailyDigest, getDailyDigestUsers } from '../notifications/digestAggregator';

const getDb = () => getFirestore();

/**
 * Scheduled function: runs every hour.
 * For each hour, finds users whose preferred digest time matches,
 * builds their digest, and enqueues it.
 */
export const sendDailyDigests = onSchedule(
	{
		schedule: '0 * * * *', // Every hour at :00
		timeZone: 'UTC',
		retryCount: 2,
		memory: '512MiB',
	},
	async (): Promise<void> => {
		const startTime = Date.now();
		const currentHourUTC = new Date().getUTCHours();
		logger.info(`Starting daily digest run for UTC hour ${currentHourUTC}`);

		try {
			const result = await processDailyDigests(currentHourUTC);

			const durationMs = Date.now() - startTime;
			logger.info('Daily digest run complete', {
				...result,
				durationMs,
			});
		} catch (error) {
			logger.error('Daily digest run failed', { error });
		}
	},
);

/**
 * Process daily digests for a given UTC hour.
 * Exported for testing and manual invocation.
 */
export async function processDailyDigests(targetHour: number): Promise<{
	usersProcessed: number;
	digestsSent: number;
	errors: number;
}> {
	let usersProcessed = 0;
	let digestsSent = 0;
	let errors = 0;

	try {
		const userIds = await getDailyDigestUsers(targetHour);

		if (userIds.length === 0) {
			logger.info('No users eligible for daily digest this hour');

			return { usersProcessed: 0, digestsSent: 0, errors: 0 };
		}

		logger.info(`Processing daily digests for ${userIds.length} users`);

		for (const userId of userIds) {
			try {
				const digest = await buildDailyDigest(userId);
				usersProcessed++;

				if (!digest || digest.items.length === 0) {
					continue; // No activity to report
				}

				// Build digest summary
				const itemCount = digest.items.length;
				const creditsSummary =
					digest.creditsEarned > 0
						? ` You earned ${digest.creditsEarned} credits.`
						: '';

				const queueItemId = `daily_${userId}_${Date.now()}`;
				const notification: NotificationQueueItem = {
					queueItemId,
					userId,
					title: 'Your daily activity summary',
					body: `${itemCount} updates across your discussions.${creditsSummary}`,
					channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
					sourceApp: SourceApp.MAIN,
					targetPath: '/notifications',
					deliverAt: null,
					frequency: NotificationFrequency.DAILY,
					triggerType: NotificationTriggerType.DAILY_DIGEST,
					status: NotificationQueueStatus.PENDING,
					createdAt: Date.now(),
				};

				await getDb()
					.collection(Collections.notificationQueue)
					.doc(queueItemId)
					.set(notification);

				digestsSent++;
			} catch (error) {
				logger.error(`Failed to process daily digest for user ${userId}`, {
					error,
				});
				errors++;
			}
		}
	} catch (error) {
		logger.error('Error in processDailyDigests', { error });
		errors++;
	}

	return { usersProcessed, digestsSent, errors };
}
