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
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
} from '@freedi/shared-types';
import type { NotificationQueueItem } from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';
import { readNoticeLanguage } from '../notifications/noticeAudience';
import { levelUpCopy } from '../notifications/noticeText';

/** Stored levels run 0-4; people see 1-5. */
const DISPLAY_LEVEL_OFFSET = 1;

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

	logger.info(`User ${userId} leveled up: ${oldLevel} -> ${newLevel}`);

	try {
		const language = await readNoticeLanguage(db, userId);
		const copy = levelUpCopy(language, newLevel + DISPLAY_LEVEL_OFFSET);

		// Enqueue a LEVEL_UP notification (in-app only: no push for levels)
		const queueItemId = `levelup_${userId}_${newLevel}_${Date.now()}`;
		const notification: NotificationQueueItem = {
			queueItemId,
			userId,
			title: copy.title,
			body: copy.body,
			channels: [NotificationChannel.IN_APP],
			sourceApp,
			targetPath: '/my/engagement',
			deliverAt: null,
			frequency: NotificationFrequency.INSTANT,
			triggerType: NotificationTriggerType.LEVEL_UP,
			status: NotificationQueueStatus.PENDING,
			createdAt: Date.now(),
		};

		await db.collection(Collections.notificationQueue).doc(queueItemId).set(notification);
	} catch (error) {
		// Non-blocking: notification failure should not break credit flow
		logError(error, {
			operation: 'engagement.checkAndNotifyLevelUp',
			userId,
			metadata: { newLevel },
		});
	}

	return newLevel;
}
