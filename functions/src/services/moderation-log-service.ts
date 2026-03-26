import { logger } from 'firebase-functions';
import { db } from '../db';
import { Collections } from '@freedi/shared-types';

interface LogModerationRejectionParams {
	originalText: string;
	reason: string;
	category: string;
	userId: string;
	displayName?: string;
	parentId: string;
	topParentId: string;
	blockedBySafetyFilter?: boolean;
}

/**
 * Logs a content moderation rejection to Firestore for admin visibility.
 * This is fire-and-forget — errors are logged but don't block the response.
 */
export async function logModerationRejection(params: LogModerationRejectionParams): Promise<void> {
	try {
		const moderationRef = db.collection(Collections.moderationLogs).doc();
		await moderationRef.set({
			moderationId: moderationRef.id,
			originalText: params.originalText,
			reason: params.reason,
			category: params.category,
			userId: params.userId,
			displayName: params.displayName || '',
			parentId: params.parentId,
			topParentId: params.topParentId,
			blockedBySafetyFilter: params.blockedBySafetyFilter || false,
			createdAt: Date.now(),
		});
	} catch (error) {
		// Non-blocking: log but don't fail the main operation
		logger.error('Failed to log moderation rejection', { error, params });
	}
}
