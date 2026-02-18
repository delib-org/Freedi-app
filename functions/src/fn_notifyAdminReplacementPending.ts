import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from './db';
import { Collections, PendingReplacement, StatementType } from '@freedi/shared-types';
import { Role } from '@freedi/shared-types';

/**
 * Cloud Function: Notify Admin Replacement Pending
 *
 * Triggers when a new queue item is created.
 * Sends in-app notifications to document admins.
 *
 * MVP Features:
 * - In-app notifications to all document admins
 * - Batched writes for efficiency
 * - Denormalized creator info for richer notifications
 */
export const fn_notifyAdminReplacementPending = onDocumentCreated(
	`${Collections.paragraphReplacementQueue}/{queueId}`,
	async (event) => {
		try {
			const queueEntry = event.data?.data() as PendingReplacement;

			if (!queueEntry) {
				logger.warn('[fn_notifyAdminReplacementPending] No queue data');

				return null;
			}

			logger.info('[fn_notifyAdminReplacementPending] Processing queue item', {
				queueId: event.params.queueId,
				documentId: queueEntry.documentId,
				paragraphId: queueEntry.paragraphId,
				consensus: queueEntry.consensus,
			});

			// Find document admins
			const adminsSnap = await db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', queueEntry.documentId)
				.where('role', '==', Role.admin)
				.get();

			if (adminsSnap.empty) {
				logger.warn('[fn_notifyAdminReplacementPending] No admins found', {
					documentId: queueEntry.documentId,
				});

				return null;
			}

			logger.info('[fn_notifyAdminReplacementPending] Found admins', {
				count: adminsSnap.size,
			});

			// Create in-app notifications for all admins
			const batch = db.batch();
			let notificationCount = 0;

			for (const adminDoc of adminsSnap.docs) {
				const subscription = adminDoc.data();
				const notificationRef = db.collection(Collections.inAppNotifications).doc();

				batch.set(notificationRef, {
					notificationId: notificationRef.id,
					userId: subscription.userId,
					statementId: queueEntry.documentId,
					parentId: queueEntry.paragraphId,
					statementType: StatementType.option, // Suggestion type
					text: `New paragraph suggestion ready for review (${Math.round(queueEntry.consensus * 100)}% consensus)`,
					creatorId: queueEntry.creatorId,
					creatorName: queueEntry.creatorDisplayName || 'Unknown',
					createdAt: queueEntry.createdAt,
					read: false,
					viewedInList: false,
					viewedInContext: false,
					// Custom fields for version control notifications
					metadata: {
						type: 'replacement_pending_approval',
						queueId: queueEntry.queueId,
						paragraphId: queueEntry.paragraphId,
						suggestionId: queueEntry.suggestionId,
						consensus: queueEntry.consensus,
						evaluationCount: queueEntry.evaluationCount,
					},
				});

				notificationCount++;

				// Firestore batch limit is 500 operations
				if (notificationCount % 500 === 0) {
					await batch.commit();
					logger.info('[fn_notifyAdminReplacementPending] Batch committed', {
						count: notificationCount,
					});
				}
			}

			// Commit remaining notifications
			if (notificationCount % 500 !== 0) {
				await batch.commit();
			}

			logger.info('[fn_notifyAdminReplacementPending] Admins notified', {
				queueId: event.params.queueId,
				adminCount: notificationCount,
			});

			return null;
		} catch (error) {
			logger.error('[fn_notifyAdminReplacementPending] Error', {
				error: error instanceof Error ? error.message : String(error),
				queueId: event.params.queueId,
				stack: error instanceof Error ? error.stack : undefined,
			});
			// Don't throw - this is a notification trigger

			return null;
		}
	},
);
