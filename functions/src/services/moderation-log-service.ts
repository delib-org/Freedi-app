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
 * Firestore-safe deterministic id for the coalesced rejection row.
 * One row per (user, question) so repeated attempts land on the same doc.
 * Document ids may not contain '/', so any is stripped from the parts.
 */
function coalescedDocId(userId: string, parentId: string): string {
	const safe = (s: string) => s.replace(/\//g, '_');

	return `${safe(userId)}__${safe(parentId)}`;
}

/**
 * Logs a content moderation rejection to Firestore for admin visibility.
 *
 * Repeated rejections by the same user on the same question are **coalesced**
 * into a single row (keyed by user+question) with a running `attemptCount`,
 * rather than writing one doc per attempt — this stops the admin moderation
 * log from flooding when a participant retries or moderation over-fires under
 * live load. The row keeps the first `createdAt`, tracks `lastAttemptAt`, and
 * always reflects the latest offending text/reason/category.
 *
 * Fire-and-forget — errors are logged but don't block the response.
 */
export async function logModerationRejection(params: LogModerationRejectionParams): Promise<void> {
	try {
		const moderationRef = db
			.collection(Collections.moderationLogs)
			.doc(coalescedDocId(params.userId, params.parentId));

		await db.runTransaction(async (transaction) => {
			const snapshot = await transaction.get(moderationRef);
			const now = Date.now();

			if (snapshot.exists) {
				const previous = (snapshot.data() ?? {}) as Partial<
					Pick<LogModerationRejectionParams, 'displayName'>
				> & { attemptCount?: number };
				const previousCount =
					typeof previous.attemptCount === 'number' && previous.attemptCount > 0
						? previous.attemptCount
						: 1;

				transaction.update(moderationRef, {
					// Latest offending content wins so admins see the most recent attempt.
					originalText: params.originalText,
					reason: params.reason,
					category: params.category,
					displayName: params.displayName || previous.displayName || '',
					blockedBySafetyFilter: params.blockedBySafetyFilter || false,
					attemptCount: previousCount + 1,
					lastAttemptAt: now,
				});

				return;
			}

			transaction.set(moderationRef, {
				moderationId: moderationRef.id,
				originalText: params.originalText,
				reason: params.reason,
				category: params.category,
				userId: params.userId,
				displayName: params.displayName || '',
				parentId: params.parentId,
				topParentId: params.topParentId,
				blockedBySafetyFilter: params.blockedBySafetyFilter || false,
				createdAt: now,
				attemptCount: 1,
				lastAttemptAt: now,
			});
		});
	} catch (error) {
		// Non-blocking: log but don't fail the main operation
		logger.error('Failed to log moderation rejection', { error, params });
	}
}
