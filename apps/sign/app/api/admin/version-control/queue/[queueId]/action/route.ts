import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import {
	Collections,
	PendingReplacement,
	ReplacementQueueStatus,
	AuditAction,
	StatementType,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { verifyAdmin, logAudit } from '@/lib/utils/versionControlHelpers';
import { executeReplacement } from '@/controllers/versionControl/executeReplacement';

/**
 * Request body for queue action
 */
interface QueueActionRequest {
	action: 'approve' | 'reject';
	adminEditedText?: string;
	adminNotes?: string;
}

/**
 * POST /api/admin/version-control/queue/[queueId]/action
 * Approve or reject a queue item
 *
 * Body:
 * - action: 'approve' | 'reject'
 * - adminEditedText?: string (optional, for edited approval)
 * - adminNotes?: string (optional, reason for approval/rejection)
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ queueId: string }> }
): Promise<NextResponse> {
	try {
		const { queueId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));
		const body: QueueActionRequest = await request.json();

		const { action, adminEditedText, adminNotes } = body;

		// Validate action
		if (!action || (action !== 'approve' && action !== 'reject')) {
			return NextResponse.json(
				{ error: 'Action must be approve or reject' },
				{ status: 400 }
			);
		}

		const db = getFirestoreAdmin();

		// Get queue item
		const queueRef = db.collection(Collections.paragraphReplacementQueue).doc(queueId);
		const queueSnap = await queueRef.get();

		if (!queueSnap.exists) {
			return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
		}

		const queueItem = queueSnap.data() as PendingReplacement;

		// Verify admin access to document
		await verifyAdmin(db, queueItem.documentId, userId);

		// Check if already processed
		if (queueItem.status !== ReplacementQueueStatus.pending) {
			return NextResponse.json(
				{ error: `Queue item already ${queueItem.status}` },
				{ status: 400 }
			);
		}

		if (action === 'approve') {
			// Execute replacement
			const result = await executeReplacement({
				db,
				queueItem,
				adminEditedText,
				adminNotes,
				userId: userId!,
			});

			if (!result.success) {
				return NextResponse.json(
					{ error: result.error || 'Failed to execute replacement' },
					{ status: 500 }
				);
			}

			// Update queue status
			await queueRef.update({
				status: ReplacementQueueStatus.approved,
				reviewedBy: userId,
				reviewedAt: Date.now(),
				...(adminEditedText && { adminEditedText }),
				...(adminNotes && { adminNotes }),
			});

			// Log audit trail
			await logAudit(db, {
				documentId: queueItem.documentId,
				paragraphId: queueItem.paragraphId,
				userId: userId!,
				action: AuditAction.approval_granted,
				metadata: {
					consensus: queueItem.consensus,
					notes: adminNotes,
				},
			});

			// Send notification to suggestion creator
			await notifyUser(db, queueItem.creatorId, {
				type: 'suggestion_approved',
				message: 'Your suggestion was approved and is now part of the document',
				documentId: queueItem.documentId,
				paragraphId: queueItem.paragraphId,
				suggestionId: queueItem.suggestionId,
			});

			logger.info('[Queue Action API] Suggestion approved', {
				queueId,
				paragraphId: queueItem.paragraphId,
				newVersion: result.newVersion,
			});

			return NextResponse.json({
				success: true,
				action: 'approved',
				newVersion: result.newVersion,
			});
		} else {
			// Reject
			await queueRef.update({
				status: ReplacementQueueStatus.rejected,
				reviewedBy: userId,
				reviewedAt: Date.now(),
				...(adminNotes && { adminNotes }),
			});

			// Log audit trail
			await logAudit(db, {
				documentId: queueItem.documentId,
				paragraphId: queueItem.paragraphId,
				userId: userId!,
				action: AuditAction.approval_rejected,
				metadata: {
					consensus: queueItem.consensus,
					notes: adminNotes,
				},
			});

			// Send notification to suggestion creator
			await notifyUser(db, queueItem.creatorId, {
				type: 'suggestion_rejected',
				message: 'Your suggestion was reviewed and not accepted at this time',
				documentId: queueItem.documentId,
				paragraphId: queueItem.paragraphId,
				suggestionId: queueItem.suggestionId,
			});

			logger.info('[Queue Action API] Suggestion rejected', {
				queueId,
				paragraphId: queueItem.paragraphId,
			});

			return NextResponse.json({
				success: true,
				action: 'rejected',
			});
		}
	} catch (error) {
		logger.error('[Queue Action API] POST error:', error);

		if (error instanceof Error) {
			if (error.message.includes('not authenticated')) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}
			if (error.message.includes('not an admin')) {
				return NextResponse.json(
					{ error: 'Forbidden - Admin access required' },
					{ status: 403 }
				);
			}
		}

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * Helper: Send notification to user
 */
async function notifyUser(
	db: any,
	userId: string,
	notification: {
		type: string;
		message: string;
		documentId: string;
		paragraphId: string;
		suggestionId: string;
	}
): Promise<void> {
	try {
		const notificationRef = db.collection(Collections.inAppNotifications).doc();

		await notificationRef.set({
			notificationId: notificationRef.id,
			userId,
			statementId: notification.documentId,
			parentId: notification.paragraphId,
			statementType: StatementType.option,
			text: notification.message,
			createdAt: Date.now(),
			read: false,
			viewedInList: false,
			viewedInContext: false,
			metadata: {
				type: notification.type,
				suggestionId: notification.suggestionId,
				paragraphId: notification.paragraphId,
			},
		});
	} catch (error) {
		logger.error('[Queue Action API] Failed to send notification:', error);
		// Don't throw - notification failure shouldn't block action
	}
}
