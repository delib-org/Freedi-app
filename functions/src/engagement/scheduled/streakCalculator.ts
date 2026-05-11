/**
 * Streak Calculator - Phase 1
 *
 * Scheduled function: runs daily at 00:05 UTC
 * Updates streak counts for all active users.
 * Implements grace day logic (missing 1 day = 50% bonus, not reset).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections, functionConfig } from '@freedi/shared-types';
import type { UserEngagement, StreakData } from '@freedi/shared-types';

const getDb = () => getFirestore();

/**
 * Scheduled function that runs daily at 00:05 UTC to update streaks.
 * Checks all users who were active yesterday or the day before.
 */
export const calculateStreaks = onSchedule(
	{
		schedule: '5 0 * * *', // 00:05 UTC daily
		timeZone: 'UTC',
		retryCount: 3,
		memory: '512MiB',
		region: functionConfig.region,
	},
	async (): Promise<void> => {
		const startTime = Date.now();
		logger.info('Starting scheduled streak calculation');

		const result = await performStreakCalculation();

		const duration = Date.now() - startTime;
		logger.info('Streak calculation completed', {
			...result,
			durationMs: duration,
		});
	},
);

interface StreakCalculationResult {
	usersProcessed: number;
	streaksReset: number;
	graceDaysUsed: number;
	errors: number;
}

/**
 * Process all user engagement documents and update streak status.
 */
export async function performStreakCalculation(): Promise<StreakCalculationResult> {
	const result: StreakCalculationResult = {
		usersProcessed: 0,
		streaksReset: 0,
		graceDaysUsed: 0,
		errors: 0,
	};

	const today = formatDate(new Date());
	const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
	const dayBefore = formatDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));

	try {
		// Process in batches of 500
		let lastDoc: QueryDocumentSnapshot | undefined;
		const BATCH_SIZE = 500;
		while (true) {
			let query = getDb()
				.collection(Collections.userEngagement)
				.orderBy('userId')
				.limit(BATCH_SIZE);

			if (lastDoc) {
				query = query.startAfter(lastDoc);
			}

			const snapshot = await query.get();

			if (snapshot.empty) {
				break;
			}

			const batch = getDb().batch();

			for (const doc of snapshot.docs) {
				try {
					const engagement = doc.data() as UserEngagement;
					const streak = engagement.streak;

					if (!streak || !streak.lastActiveDate) {
						continue;
					}

					const lastActive = streak.lastActiveDate;

					// User was active today - no change needed
					if (lastActive === today) {
						result.usersProcessed++;
						continue;
					}

					// User was active yesterday - streak continues (no update needed until tomorrow)
					if (lastActive === yesterday) {
						result.usersProcessed++;
						continue;
					}

					// User was active day before yesterday - grace day
					if (lastActive === dayBefore && !streak.streakGraceDayUsed) {
						const updatedStreak: StreakData = {
							...streak,
							streakGraceDayUsed: true,
						};
						batch.update(doc.ref, {
							streak: updatedStreak,
							lastUpdate: Date.now(),
						});
						result.graceDaysUsed++;
						result.usersProcessed++;
						continue;
					}

					// User missed more than 1 day (or grace already used) - reset streak
					if (streak.currentStreak > 0) {
						const updatedStreak: StreakData = {
							currentStreak: 0,
							longestStreak: streak.longestStreak,
							lastActiveDate: streak.lastActiveDate,
							streakGraceDayUsed: false,
						};
						batch.update(doc.ref, {
							streak: updatedStreak,
							lastUpdate: Date.now(),
						});
						result.streaksReset++;
					}

					result.usersProcessed++;
				} catch (error) {
					logger.error('Error processing streak for user', {
						userId: doc.id,
						error,
					});
					result.errors++;
				}
			}

			await batch.commit();
			lastDoc = snapshot.docs[snapshot.docs.length - 1];

			if (snapshot.size < BATCH_SIZE) {
				break;
			}
		}
	} catch (error) {
		logger.error('Streak calculation failed', error);
		result.errors++;
	}

	return result;
}

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}
