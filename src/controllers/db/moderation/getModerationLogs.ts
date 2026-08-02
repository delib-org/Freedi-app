import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { DB } from '../config';
import { Collections, ModerationLog } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

const MODERATION_QUERY_LIMIT = 50;

function isMissingIndexError(error: unknown): boolean {
	const code = (error as { code?: string })?.code;
	const message = error instanceof Error ? error.message : String(error);

	return code === 'failed-precondition' && message.includes('requires an index');
}

/**
 * Fetches moderation logs for a specific statement (by topParentId).
 * Returns the most recent rejections first.
 */
export async function getModerationLogs(topParentId: string): Promise<ModerationLog[]> {
	const moderationRef = collection(DB, Collections.moderationLogs);

	try {
		const q = query(
			moderationRef,
			where('topParentId', '==', topParentId),
			orderBy('createdAt', 'desc'),
			limit(MODERATION_QUERY_LIMIT),
		);

		const snapshot = await getDocs(q);

		return snapshot.docs.map((doc) => doc.data() as ModerationLog);
	} catch (error) {
		// The `topParentId + createdAt` composite index may not exist yet in a
		// given environment. Fall back to an equality-only query (which needs no
		// composite index) and order client-side rather than showing nothing.
		if (isMissingIndexError(error)) {
			console.info(
				'[moderation] Composite index missing for moderationLogs; using unordered fallback',
			);

			try {
				const fallbackSnapshot = await getDocs(
					query(moderationRef, where('topParentId', '==', topParentId)),
				);

				return fallbackSnapshot.docs
					.map((doc) => doc.data() as ModerationLog)
					.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
					.slice(0, MODERATION_QUERY_LIMIT);
			} catch (fallbackError) {
				logError(fallbackError, {
					operation: 'moderation.getModerationLogs.fallback',
					metadata: { topParentId },
				});

				return [];
			}
		}

		logError(error, {
			operation: 'moderation.getModerationLogs',
			metadata: { topParentId },
		});

		return [];
	}
}
