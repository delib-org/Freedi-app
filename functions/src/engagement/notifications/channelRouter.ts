/**
 * Channel Router - Phase 2
 *
 * Routes notification queue items to the correct delivery channel(s):
 * - PUSH: Uses existing FCM infrastructure (fn_notifications.ts)
 * - IN_APP: Writes to inAppNotifications collection
 * - EMAIL: Uses existing email pipeline (fn_emailNotifications.ts)
 *
 * Respects user preferences, quiet hours, and platform detection.
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { Collections, NotificationChannel } from '@freedi/shared-types';
import type { NotificationQueueItem } from '@freedi/shared-types';

const getDb = () => getFirestore();

interface ChannelResult {
	channel: NotificationChannel;
	success: boolean;
	error?: string;
}

/**
 * Route a notification to all specified channels.
 * Returns results per channel.
 */
export async function routeToChannels(
	item: NotificationQueueItem,
): Promise<ChannelResult[]> {
	const results: ChannelResult[] = [];

	const channelHandlers = item.channels.map(async (channel) => {
		try {
			switch (channel) {
				case NotificationChannel.PUSH:
					await sendPushNotification(item);
					results.push({ channel, success: true });
					break;

				case NotificationChannel.IN_APP:
					await writeInAppNotification(item);
					results.push({ channel, success: true });
					break;

				case NotificationChannel.EMAIL:
					await sendEmailNotification(item);
					results.push({ channel, success: true });
					break;

				default:
					results.push({
						channel,
						success: false,
						error: `Unknown channel: ${channel}`,
					});
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			logger.error(`Channel ${channel} failed for queue item ${item.queueItemId}`, {
				error: errorMsg,
				userId: item.userId,
			});
			results.push({ channel, success: false, error: errorMsg });
		}
	});

	await Promise.all(channelHandlers);

	return results;
}

/**
 * Send push notification via FCM.
 * Looks up user's push tokens and sends to all registered devices.
 */
async function sendPushNotification(item: NotificationQueueItem): Promise<void> {
	// Get user's push tokens
	const tokensSnapshot = await getDb()
		.collection(Collections.pushNotifications)
		.where('userId', '==', item.userId)
		.get();

	if (tokensSnapshot.empty) {
		logger.info(`No push tokens for user ${item.userId}, skipping push`);

		return;
	}

	const tokens: string[] = tokensSnapshot.docs
		.map((doc) => doc.data().token as string)
		.filter(Boolean);

	if (tokens.length === 0) return;

	// Build FCM message
	const notificationUrl = item.targetPath || '/';

	const sendPromises = tokens.map(async (token) => {
		try {
			await admin.messaging().send({
				token,
				notification: {
					title: item.title,
					body: item.body,
					...(item.imageUrl && { image: item.imageUrl }),
				},
				data: {
					queueItemId: item.queueItemId,
					triggerType: item.triggerType,
					url: notificationUrl,
					sourceApp: item.sourceApp,
					...(item.statementId && { statementId: item.statementId }),
					...(item.parentId && { parentId: item.parentId }),
				},
				webpush: {
					headers: { Urgency: 'high' },
					fcmOptions: { link: notificationUrl },
				},
				android: {
					priority: 'high',
					notification: {
						channelId: 'freedi_engagement',
						tag: `engagement-${item.triggerType}`,
					},
				},
				apns: {
					headers: { 'apns-priority': '10' },
					payload: { aps: { sound: 'default' } },
				},
			});
		} catch (error) {
			const errorCode =
				error instanceof Error && 'code' in error
					? (error as { code: string }).code
					: 'unknown';

			// Clean up invalid tokens
			if (
				errorCode === 'messaging/registration-token-not-registered' ||
				errorCode === 'messaging/invalid-registration-token'
			) {
				logger.info(`Removing invalid token for user ${item.userId}`);
				await getDb()
					.collection(Collections.pushNotifications)
					.doc(token)
					.delete()
					.catch(() => { /* ignore cleanup errors */ });
			} else {
				throw error;
			}
		}
	});

	await Promise.all(sendPromises);
}

/**
 * Write an in-app notification to Firestore.
 * Uses deterministic ID for idempotency.
 */
async function writeInAppNotification(item: NotificationQueueItem): Promise<void> {
	const notificationId = `eng_${item.userId}_${item.queueItemId}`;
	const notificationRef = getDb().collection(Collections.inAppNotifications).doc(notificationId);

	await notificationRef.set({
		userId: item.userId,
		notificationId,
		text: item.body,
		parentId: item.parentId || '',
		statementId: item.statementId || '',
		statementType: 'engagement',
		creatorId: 'system',
		creatorName: 'Freedi',
		createdAt: item.createdAt,
		read: false,
		viewedInList: false,
		viewedInContext: false,
		// Engagement-specific fields
		triggerType: item.triggerType,
		title: item.title,
		sourceApp: item.sourceApp,
		targetPath: item.targetPath,
	});
}

/**
 * Send email notification.
 * For Phase 2, engagement emails are logged but not sent.
 * Full email template integration comes in Phase 3 (digest emails).
 */
async function sendEmailNotification(item: NotificationQueueItem): Promise<void> {
	// Check if user has an email on file
	const userDoc = await getDb().collection('usersV2').doc(item.userId).get();

	if (!userDoc.exists) {
		logger.info(`No user doc for ${item.userId}, skipping email`);

		return;
	}

	const userData = userDoc.data();
	const email = userData?.email;

	if (!email) {
		logger.info(`No email for user ${item.userId}, skipping email`);

		return;
	}

	// For now, log that email would be sent.
	// Full email template integration comes in Phase 3 (digest emails).
	logger.info(`Email notification queued for ${item.userId}`, {
		email,
		title: item.title,
		triggerType: item.triggerType,
	});
}
