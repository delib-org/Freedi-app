/**
 * Queue Processor - Phase 2
 *
 * Firestore trigger that processes notificationQueue items.
 * When a new item is created with status 'pending', it:
 * 1. Marks it as 'processing'
 * 2. Routes to the appropriate channel(s) via channelRouter
 * 3. Updates status to 'sent', 'failed', or 'skipped'
 *
 * Also includes a batch processor for stuck/scheduled items.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, NotificationQueueStatus } from '@freedi/shared-types';
import type { NotificationQueueItem } from '@freedi/shared-types';
import { routeToChannels } from './channelRouter';

const getDb = () => getFirestore();

/** Max age for a 'processing' item before it's considered stuck (5 minutes) */
const STUCK_PROCESSING_MS = 5 * 60 * 1000;

/** Max retry count before giving up */
const MAX_RETRIES = 3;

/**
 * Process a single notification queue item.
 * Called by the Firestore onCreate trigger.
 */
export async function processQueueItem(
	queueItemId: string,
	item: NotificationQueueItem,
): Promise<void> {
	const docRef = getDb().collection(Collections.notificationQueue).doc(queueItemId);

	try {
		// Skip if not pending
		if (item.status !== NotificationQueueStatus.PENDING) {
			return;
		}

		// Check if delivery is scheduled for later
		if (item.deliverAt && item.deliverAt > Date.now()) {
			logger.info(`Queue item ${queueItemId} scheduled for later delivery`, {
				deliverAt: new Date(item.deliverAt).toISOString(),
			});

			return;
		}

		// Check retry count
		const retryCount = item.retryCount ?? 0;
		if (retryCount >= MAX_RETRIES) {
			await docRef.update({
				status: NotificationQueueStatus.FAILED,
				error: `Max retries (${MAX_RETRIES}) exceeded`,
				processedAt: Date.now(),
			});

			return;
		}

		// Mark as processing
		await docRef.update({
			status: NotificationQueueStatus.PROCESSING,
		});

		// Route to channels
		const results = await routeToChannels(item);

		// Determine overall status
		const allSucceeded = results.every((r) => r.success);
		const allFailed = results.every((r) => !r.success);

		if (allSucceeded) {
			await docRef.update({
				status: NotificationQueueStatus.SENT,
				processedAt: Date.now(),
			});
		} else if (allFailed) {
			const errors = results
				.filter((r) => !r.success)
				.map((r) => `${r.channel}: ${r.error}`)
				.join('; ');

			await docRef.update({
				status: NotificationQueueStatus.FAILED,
				error: errors,
				retryCount: retryCount + 1,
				processedAt: Date.now(),
			});
		} else {
			// Partial success - mark as sent but log failures
			const errors = results
				.filter((r) => !r.success)
				.map((r) => `${r.channel}: ${r.error}`)
				.join('; ');

			await docRef.update({
				status: NotificationQueueStatus.SENT,
				error: `Partial: ${errors}`,
				processedAt: Date.now(),
			});
		}

		logger.info(`Processed queue item ${queueItemId}`, {
			channels: results.map((r) => `${r.channel}:${r.success ? 'ok' : 'fail'}`),
		});
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to process queue item ${queueItemId}`, { error: errorMsg });

		try {
			await docRef.update({
				status: NotificationQueueStatus.FAILED,
				error: errorMsg,
				retryCount: (item.retryCount ?? 0) + 1,
				processedAt: Date.now(),
			});
		} catch (updateError) {
			logger.error(`Failed to update queue item ${queueItemId} status`, { updateError });
		}
	}
}

/**
 * Process pending and stuck queue items.
 * Can be called from a scheduled function or HTTP endpoint.
 */
export async function processPendingQueueItems(): Promise<{
	processed: number;
	errors: number;
}> {
	let processed = 0;
	let errors = 0;

	try {
		// Get pending items (immediate delivery)
		const pendingSnapshot = await getDb()
			.collection(Collections.notificationQueue)
			.where('status', '==', NotificationQueueStatus.PENDING)
			.limit(100)
			.get();

		// Get stuck items (processing for too long)
		const stuckThreshold = Date.now() - STUCK_PROCESSING_MS;
		const stuckSnapshot = await getDb()
			.collection(Collections.notificationQueue)
			.where('status', '==', NotificationQueueStatus.PROCESSING)
			.limit(50)
			.get();

		// Reset stuck items to pending
		for (const doc of stuckSnapshot.docs) {
			const data = doc.data() as NotificationQueueItem;
			const createdAt = data.createdAt || 0;

			if (createdAt < stuckThreshold) {
				await doc.ref.update({
					status: NotificationQueueStatus.PENDING,
					error: 'Reset from stuck processing state',
				});
			}
		}

		// Process pending items
		for (const doc of pendingSnapshot.docs) {
			try {
				const item = doc.data() as NotificationQueueItem;
				await processQueueItem(doc.id, item);
				processed++;
			} catch (error) {
				logger.error(`Error processing queue item ${doc.id}`, { error });
				errors++;
			}
		}
	} catch (error) {
		logger.error('Error in processPendingQueueItems', { error });
		errors++;
	}

	return { processed, errors };
}
