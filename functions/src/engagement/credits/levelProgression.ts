/**
 * Level Progression - Phase 1
 *
 * Detects level-up events after credit awards.
 * Triggers LEVEL_UP notifications when users cross thresholds.
 * Pure calculation delegated to @freedi/engagement-core.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	EngagementLevel,
	LEVEL_NAMES,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
} from '@freedi/shared-types';
import type { NotificationQueueItem } from '@freedi/shared-types';

/**
 * Check if the user leveled up and enqueue a notification if so.
 * Returns the new level if a level-up occurred, null otherwise.
 */
export async function checkAndNotifyLevelUp(
	userId: string,
	oldLevel: EngagementLevel,
	newLevel: EngagementLevel,
	sourceApp: SourceApp,
): Promise<EngagementLevel | null> {
	if (newLevel <= oldLevel) {
		return null;
	}

	const db = getFirestore();
	const levelName = LEVEL_NAMES[newLevel] || `Level ${newLevel}`;

	logger.info(`User ${userId} leveled up: ${LEVEL_NAMES[oldLevel]} -> ${levelName}`);

	// Enqueue a LEVEL_UP notification
	const queueItemId = `levelup_${userId}_${newLevel}_${Date.now()}`;
	const notification: NotificationQueueItem = {
		queueItemId,
		userId,
		title: 'Level Up!',
		body: `Congratulations! You reached ${levelName} level.`,
		channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
		sourceApp,
		targetPath: '/profile',
		deliverAt: null,
		frequency: NotificationFrequency.INSTANT,
		triggerType: NotificationTriggerType.LEVEL_UP,
		status: NotificationQueueStatus.PENDING,
		createdAt: Date.now(),
	};

	try {
		await db.collection(Collections.notificationQueue).doc(queueItemId).set(notification);
	} catch (error) {
		// Non-blocking: notification failure should not break credit flow
		logger.error('Failed to enqueue level-up notification', { userId, newLevel, error });
	}

	return newLevel;
}
